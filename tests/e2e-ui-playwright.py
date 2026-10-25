# V0.0.7 UX + sound end-to-end check in a real browser (headless Chromium) with a FAKE AudioContext that records every oscillator.
# Needs: npm install (ws), pip install playwright && playwright install chromium.  Run: python3 tests/e2e-ui-playwright.py
import json, os, re, socket, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright
from playwright.sync_api import Page as _Page
_orig_wff = _Page.wait_for_function   # default polling is requestAnimationFrame, which can stall on a page that is not being rendered; poll on a timer instead
def _wff(self, expression, arg=None, timeout=None, polling=100):
    e = expression.strip()   # pages served with our CSP forbid eval: always hand Playwright a function, never a bare expression string
    if not (e.startswith('(') or e.startswith('function') or e.startswith('async')): e = '() => (' + e + ')'
    return _orig_wff(self, e, arg=arg, timeout=timeout, polling=polling)
_Page.wait_for_function = _wff
ROOT = pathlib.Path(__file__).resolve().parent.parent; FILE = (ROOT / 'index.html').as_uri()
EDGES = ['1-2','2-3','3-4','4-5','5-6','6-7','7-8','8-9','9-10','1-10','2-7','3-8','4-9','5-10']
LANGS = ['en','ru','it','fr','es','de','pt','ja','ko','zh','ar']
res = []
def menu(pg, sel): pg.click('#menuBtn'); pg.click(sel)   # rarely used actions live in the "More" menu
def check(name, cond, extra=''):
    res.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(extra) if extra != '' else ''))
# Fake Web Audio: logs the first frequency of every oscillator with a timestamp; also logs WebSocket message arrival times.
INIT = """
window.__osc=[];window.__ws=[];window.__req=[];
class FakeAC{constructor(){window.__made=(window.__made||0)+1;this.state='running';this.currentTime=0;this.destination={}}
 createGain(){return {gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}
 createOscillator(){return {type:'',frequency:{setValueAtTime(f){window.__osc.push({t:performance.now(),f:Math.round(f)})},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}}
 resume(){return Promise.resolve()}}
window.AudioContext=FakeAC;window.webkitAudioContext=FakeAC;
const OW=window.WebSocket;window.WebSocket=class extends OW{constructor(...a){super(...a);this.addEventListener('message',e=>{try{window.__ws.push({t:performance.now(),type:JSON.parse(e.data).type})}catch(x){}})}};
"""
SIG = {'click': [660], 'create': [784], 'cut': [330], 'confirm': [523, 784], 'edgeCreated': [440], 'edgeRemoved': [520], 'conflict': [400, 400], 'beacon': [988], 'netError': [220]}
OVER = """()=>{const bad=[];const d=document.documentElement;if(d.scrollWidth>d.clientWidth+1)bad.push('page-hscroll '+d.scrollWidth+'>'+d.clientWidth);
document.querySelectorAll('button,select,.card,.chip,#panel,.banner,.step,.tag,.phase,.schip,dialog[open],input').forEach(e=>{if(e.scrollWidth>e.clientWidth+2)bad.push(e.tagName+'.'+(e.id||e.className)+':'+(e.textContent||'').slice(0,16))});return bad}"""
def freqs(pg): return pg.evaluate('window.__osc.map(o=>o.f)')
def n_osc(pg): return pg.evaluate('window.__osc.length')
def sel(pg, node=None, act=None, edge=None):
    ch = pg.locator('#panel .chips')
    if node: ch.nth(0).locator('button').nth(node-1).click()
    if act: ch.nth(1).locator('button').nth(0 if act == 'CREATE' else 1).click()
    if edge: ch.nth(2).locator('button').nth(EDGES.index(edge)).click()
def page(browser, size=(1366, 768), locale='en-US', **kw):
    ctx = browser.new_context(viewport={'width': size[0], 'height': size[1]}, locale=locale, **kw); ctx.add_init_script(INIT); pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.on('request', lambda r: pg.evaluate('u=>window.__req.push(u)', r.url) if False else None)
    return ctx, pg, errs
with sync_playwright() as p:
    b = p.chromium.launch(); errs_all = []
    # ---------- layout at the two required sizes, in all 11 languages ----------
    for size in [(360, 740), (1366, 768)]:
        ctx, pg, errs = page(b, size); errs_all.append(errs); pg.goto(FILE); bad = []
        for L in LANGS:
            pg.select_option('#lang', L); pg.click('#new') if False else None
            o = pg.evaluate(OVER); sel(pg, 3, 'CUT', '2-3'); o += pg.evaluate(OVER)
            pg.locator('#panel .actions button').nth(0).click(); o += pg.evaluate(OVER)       # handoff screen
            pg.locator('#panel button').first.click(); sel(pg, 8, 'CREATE', '3-8'); pg.locator('#panel .actions button').nth(0).click(); o += pg.evaluate(OVER)   # reveal
            for dlg in ['#rules', '#settingsBtn']: menu(pg, dlg); o += pg.evaluate(OVER); pg.keyboard.press('Escape')
            pg.locator('#panel button').first.click(); pg.click('#undo'); pg.click('#undo') if False else None
            if o: bad.append((L, o[:3]))
            pg.evaluate("document.querySelector('#new').disabled||document.querySelector('#new').click()"); 
        check(f'{size[0]}px: no horizontal scroll or clipped buttons/cards/steps/tags in all 11 languages (pick, handoff, reveal, dialogs)', not bad, bad)
        hs = pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth")
        ctx.close()
    ctx, pg, errs = page(b, (1366, 768)); errs_all.append(errs); pg.goto(FILE); th = pg.evaluate("document.querySelector('.tools').getBoundingClientRect().height"); hh = pg.evaluate("document.querySelector('.top').getBoundingClientRect().height")
    check('1366px: the toolbar is one tidy row (icon buttons keep tooltips) and the header stays compact', th < 60 and hh < 140, (round(th), round(hh)))
    named = pg.evaluate("[...document.querySelectorAll('.tools button')].every(b=>b.title&&b.title.length>1&&(b.textContent||'').trim().length>1)"); check('every toolbar button keeps an accessible name and a tooltip', named); ctx.close()
    # ---------- phone: tap targets and board size ----------
    ctx, pg, errs = page(b, (360, 740)); errs_all.append(errs); pg.goto(FILE)
    small = pg.evaluate("[...document.querySelectorAll('button:not([disabled]),select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.height<43.5||r.width<43.5)}).map(e=>e.id||e.className)")
    bw = pg.evaluate("document.querySelector('#board').getBoundingClientRect().width")
    check('360px: every visible button/select is at least 44px tall and 44px wide; the board is nearly full width', not small and bw > 300, (small, round(bw)))
    # ---------- stepper, aria, keyboard ----------
    steps = lambda: pg.evaluate("[...document.querySelectorAll('.steps .step')].map(e=>e.className.replace('step ',''))")
    check('stepper: initially node is current, others todo', steps() == ['current', 'todo', 'todo', 'todo'], steps())
    sel(pg, 5); check('stepper: after choosing a node, action is current', steps() == ['done', 'current', 'todo', 'todo'], steps())
    sel(pg, None, 'CUT'); sel(pg, None, None, '4-5'); check('stepper: all chosen -> confirm is current with its hint', steps() == ['done', 'done', 'done', 'current'] and 'confirm' in pg.inner_text('.stephint').lower(), pg.inner_text('.stephint'))
    check('aria: chips/nodes expose aria-pressed, the current step has aria-current', pg.evaluate("document.querySelectorAll('#panel .chip[aria-pressed]').length")>=26 and pg.evaluate("document.querySelectorAll('#board [role=button][aria-pressed]').length")>=24 and pg.evaluate("document.querySelectorAll('.step[aria-current=step]').length")==1)
    pg.locator('#panel button:has-text("Cancel")').click(); pg.evaluate("document.activeElement.blur()")
    pg.locator('#board [aria-label="node 6"]').focus(); pg.keyboard.press('Enter'); pg.locator('#board .hit').nth(EDGES.index('5-6')).focus(); pg.keyboard.press('Space')
    check('keyboard: Enter on a node and Space on an edge select them (focus-visible reachable)', pg.locator('.node.intent').count() == 1 and pg.locator('.edge.sel').count() == 1)
    ctx.close()
    # ---------- sound: fake AudioContext ----------
    ctx, pg, errs = page(b); errs_all.append(errs); pg.goto(FILE); pg.wait_for_timeout(200)
    check('page load and first render are silent (no sound without a real event)', n_osc(pg) == 0 and pg.evaluate('window.__made||0') == 0)
    for L in ['de', 'ja', 'ar', 'en', 'fr']: pg.select_option('#lang', L)
    check('re-rendering (5 language switches) plays nothing', n_osc(pg) == 0)
    pg.locator('#panel .chips').nth(0).locator('button').nth(2).click(); check('node pick plays exactly one click tick (660Hz)', freqs(pg) == [660], freqs(pg))
    pg.evaluate('window.__osc.length=0'); sel(pg, None, 'CREATE'); sel(pg, None, 'CUT'); check('CREATE gives a higher short tone than CUT (784 vs 330)', freqs(pg) == [784, 330], freqs(pg))
    pg.evaluate('window.__osc.length=0'); sel(pg, None, None, '2-3'); pg.locator('#panel .actions button').nth(0).click(); f = freqs(pg)
    check('confirm click plays the confirm pair (523,784) once, preceded by the edge-pick tick', f == [660, 523, 784], f)
    pg.locator('#panel button').first.click(); pg.evaluate('window.__osc.length=0'); sel(pg, 8); sel(pg, None, 'CREATE'); sel(pg, None, None, '3-8'); pg.evaluate('window.__osc.length=0'); pg.locator('#panel .actions button').nth(0).click(); pg.wait_for_timeout(900)
    f = freqs(pg); check('round resolved (one edge created, one removed): confirm, reveal (587), created (440), removed (520), once each', f == [523, 784, 587, 440, 520], f)
    n = n_osc(pg)
    for L in ['de', 'ja', 'ar', 'en']: pg.select_option('#lang', L)
    pg.set_viewport_size({'width': 400, 'height': 700}); pg.set_viewport_size({'width': 1366, 'height': 768}); pg.wait_for_timeout(300)
    check('repeated renders and resizes after the round replay nothing', n_osc(pg) == n, (n, n_osc(pg)))
    menu(pg, '#settingsBtn'); vol0 = pg.input_value('#soundVol'); pg.fill('#soundVol', '20'); pg.evaluate("document.querySelector('#soundVol').dispatchEvent(new Event('input'))")
    pg.evaluate('window.__osc.length=0'); pg.click('#soundTest'); check('test-sound button plays the confirm pair', freqs(pg) == [523, 784], freqs(pg))
    pg.uncheck('#soundOn'); check('mute disables the volume slider and test button', pg.is_disabled('#soundVol') and pg.is_disabled('#soundTest'))
    pg.keyboard.press('Escape'); pg.evaluate('window.__osc.length=0'); made = pg.evaluate('window.__made')
    pg.locator('#panel button').first.click(); sel(pg, 2); sel(pg, None, 'CUT'); sel(pg, None, None, '1-2'); pg.locator('#panel .actions button').nth(0).click(); pg.click('#new'); menu(pg, '#rules'); pg.keyboard.press('Escape')
    check('muted: clicks, picks, confirm and a new game play NOTHING', n_osc(pg) == 0, freqs(pg))
    pg.reload(); pg.wait_for_timeout(300); pg.evaluate('window.__osc.length=0'); pg.locator('#panel .chips').nth(0).locator('button').nth(0).click()
    st = pg.evaluate("JSON.parse(localStorage.getItem('nori.sound.v1'))"); check('mute and volume persist across reload; still silent after reload', n_osc(pg) == 0 and st['enabled'] is False and abs(st['volume'] - 0.2) < 1e-9, st)
    menu(pg, '#settingsBtn'); pg.check('#soundOn'); pg.keyboard.press('Escape'); pg.evaluate('window.__osc.length=0'); pg.locator('#panel .chips').nth(0).locator('button').nth(1).click(); check('unmuting restores sound', freqs(pg) == [660], freqs(pg))
    ctx.close()
    # ---------- motion, accents, tour ----------
    ctx, pg, errs = page(b, reduced_motion='reduce'); errs_all.append(errs); pg.goto(FILE)
    sel(pg, 3, 'CUT', '2-3'); pg.locator('#panel .actions button').nth(0).click(); pg.locator('#panel button').first.click(); sel(pg, 8, 'CREATE', '3-8'); pg.locator('#panel .actions button').nth(0).click(); pg.wait_for_timeout(300)
    an = pg.evaluate("(()=>{const e=document.querySelector('.edge.chg');return e?{n:document.querySelectorAll('.edge.chg').length,anim:getComputedStyle(e).animationName,op:getComputedStyle(e).opacity}:null})()")
    check('prefers-reduced-motion: changed edges are marked (2 of them) without any animation', an and an['n'] == 2 and an['anim'] == 'none' and float(an['op']) > 0.4, an)
    ctx.close()
    ctx, pg, errs = page(b); errs_all.append(errs); pg.goto(FILE)
    sel(pg, 3, 'CUT', '2-3'); pg.locator('#panel .actions button').nth(0).click(); pg.locator('#panel button').first.click(); sel(pg, 8, 'CREATE', '3-8'); pg.locator('#panel .actions button').nth(0).click(); pg.wait_for_timeout(150)
    a1 = float(pg.evaluate("getComputedStyle(document.querySelector('.edge.chg')).opacity")); anim = pg.evaluate("getComputedStyle(document.querySelector('.edge.chg')).animationName"); pg.wait_for_timeout(2400); a2 = float(pg.evaluate("getComputedStyle(document.querySelector('.edge.chg')).opacity"))
    check('with motion on, the accent on changed edges is visible, then settles to calm (opacity -> 0) within ~2s', anim == 'accent' and a1 > 0.3 and a2 < 0.05, (anim, a1, a2))
    menu(pg, '#settingsBtn'); pg.check('#motionReduce'); pg.keyboard.press('Escape'); pg.reload(); pg.wait_for_timeout(200)
    check('"Reduce animations" is stored and applied after reload (data-motion=off)', pg.evaluate("document.documentElement.dataset.motion") == 'off')
    ctx.close()
    ctx, pg, errs = page(b); errs_all.append(errs); pg.goto(FILE)
    check('first visit shows the optional intro (not a modal); the board stays usable', pg.is_visible('#intro') and not pg.evaluate("document.querySelector('dialog[open]')!==null"))
    pg.click('#tourStart'); t1 = pg.inner_text('#tourText'); pg.click('#tourNext'); t2 = pg.inner_text('#tourText'); pg.click('#tourBack'); back = pg.inner_text('#tourText'); pg.click('#tourNext'); pg.click('#tourNext'); pg.click('#tourNext')
    check('tour: 3 steps with next/back, the last button finishes and hides the intro', t1 != t2 and back == t1 and not pg.is_visible('#intro') and not pg.evaluate("document.querySelector('#dlgTour').open"), (t1[:30], t2[:30]))
    pg.reload(); check('intro stays dismissed after reload', not pg.is_visible('#intro'))
    menu(pg, '#rules'); pg.click('#rulesTour'); check('rules dialog can reopen the tour', pg.evaluate("document.querySelector('#dlgTour').open")); pg.click('#tourSkip')
    ctx.close()
    # ---------- online: sounds follow the SERVER; no hidden info ----------
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT, env=dict(os.environ, PORT=str(port)), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for _ in range(100):
        try: socket.create_connection(('127.0.0.1', port), 0.2).close(); break
        except OSError: time.sleep(0.05)
    BASE = f'http://127.0.0.1:{port}/'; cA, A, eA = page(b); cB, Bp, eB = page(b); errs_all += [eA, eB]; A.goto(BASE); Bp.goto(BASE)
    A.click('#onlineBtn'); A.click('#onlineCreate'); A.wait_for_function("document.querySelector('#onlineCodeShown').textContent.length===6"); code = A.inner_text('#onlineCodeShown'); A.click('#onlineClose')
    A.evaluate('window.__osc.length=0'); Bp.click('#onlineBtn'); Bp.fill('#onlineCode', code); Bp.click('#onlineJoin'); Bp.wait_for_function("document.querySelector('#onlineCodeShown').textContent.length===6"); Bp.click('#onlineClose')
    A.wait_for_function("document.querySelectorAll('#panel .chips').length===3"); Bp.wait_for_function("document.querySelectorAll('#panel .chips').length===3")
    check('online: the host hears exactly one "opponent joined" tone (523,659)', freqs(A) == [523, 659], freqs(A))
    ph = A.inner_text('#phase'); check('online phase line says whose move it is', 'Your move' in ph, ph)
    sel(A, 3, 'CUT', '2-3'); A.evaluate('window.__osc.length=0'); Bp.evaluate('window.__osc.length=0'); tclick = A.evaluate('performance.now()'); A.locator('#panel .actions button').nth(0).click()
    A.wait_for_function("window.__ws.some(m=>m.type==='choice_locked')"); A.wait_for_timeout(300)
    lock_t = A.evaluate("window.__ws.find(m=>m.type==='choice_locked').t"); osc = A.evaluate('window.__osc'); conf = [o for o in osc if o['f'] in (523,)]
    check('online: the confirm tone plays only AFTER the server confirmed the lock (never at the click)', len(conf) == 1 and conf[0]['t'] >= lock_t and not [o for o in osc if o['t'] < lock_t], (len(conf), round(conf[0]['t'] - lock_t, 1) if conf else None, [o for o in osc if o['t'] < lock_t]))
    check('online: waiting status is shown after the lock', 'waiting' in A.inner_text('#phase').lower(), A.inner_text('#phase'))
    Bp.wait_for_function("document.querySelector('#cards').innerText.includes('Choice made')"); bo = Bp.evaluate('window.__osc')
    check("online: the opponent's lock makes NO sound on the other side and shows only a status", len(bo) == 0 and 'Choice made' in Bp.inner_text('#cards'), bo)
    sel(Bp, 8, 'CREATE', '3-8'); Bp.evaluate('window.__osc.length=0'); Bp.locator('#panel .actions button').nth(0).click(); A.wait_for_function("document.querySelectorAll('.badge').length===2"); Bp.wait_for_function("document.querySelectorAll('.badge').length===2"); A.wait_for_timeout(900); Bp.wait_for_timeout(900)
    res_t = A.evaluate("window.__ws.find(m=>m.type==='round_resolved').t"); oa = A.evaluate('window.__osc'); fa = [o['f'] for o in oa if o['t'] > res_t]
    check('online: edge sounds (created 440, removed 520) come after round_resolved and play once on both clients', [f for f in fa if f in (440, 520)] == [440, 520] and [o['f'] for o in Bp.evaluate('window.__osc') if o['f'] in (440, 520)] == [440, 520], (fa, ))
    na = A.evaluate('window.__osc.length'); A.select_option('#lang', 'de'); A.select_option('#lang', 'en'); A.wait_for_timeout(200); check('online: re-rendering after the reveal replays nothing', A.evaluate('window.__osc.length') == na)
    A.locator('#panel button').first.click(); menu(A, '#settingsBtn'); A.uncheck('#soundOn'); A.keyboard.press('Escape'); Bp.locator('#panel button').first.click(); A.evaluate('window.__osc.length=0')
    A.wait_for_function("document.querySelectorAll('#panel .chips').length===3"); sel(A, 1, 'CREATE', '1-2'); A.locator('#panel .actions button').nth(0).click(); A.wait_for_function("document.querySelector('#phase').innerText.toLowerCase().includes('waiting')")
    Bp.wait_for_function("document.querySelectorAll('#panel .chips').length===3"); sel(Bp, 5, 'CREATE', '5-6'); Bp.locator('#panel .actions button').nth(0).click(); A.wait_for_function("document.querySelector('#log').children.length===2"); A.wait_for_timeout(700)
    check('online + muted: a full round on the muted client is completely silent', A.evaluate('window.__osc.length') == 0, A.evaluate('window.__osc'))
    A.locator('#panel button').first.click(); 
    stor = A.evaluate("JSON.stringify(Object.assign({},localStorage))"); check('no hidden choice or opponent data in storage after online play', '"CUT"' not in stor and 'CREATE' not in stor.split('nori.save.v1')[0], stor[:120])
    Bp.evaluate('window.__osc.length=0'); A.reload(); Bp.wait_for_function('window.__osc.length>=3', timeout=9000); Bp.wait_for_timeout(300); fb3 = freqs(Bp)
    check('online: opponent disconnect plays the "left" tone (659,440), the seat-restoring reload plays "back" (494), once each', fb3 == [659, 440, 494], fb3)
    cE, E, eE = page(b); errs_all.append(eE); E.goto(BASE); E.click('#onlineBtn'); E.fill('#onlineCode', 'ZZZZZZ'); E.evaluate('window.__osc.length=0'); E.click('#onlineJoin'); E.wait_for_function("document.querySelector('#onlineError').textContent.length>0"); E.wait_for_timeout(200); fe_ = freqs(E)
    check('online: a server error (unknown room) plays the error tone once (196,165) besides the button tick', [x for x in fe_ if x in (196, 165)] == [196, 165], fe_); cE.close()
    A.click('#onlineBtn'); A.click('#onlineLeave'); A.wait_for_timeout(200)
    check('leaving a running online game asks for confirmation; local controls return', not A.is_disabled('#new'))
    cA.close(); cB.close(); srv.terminate(); srv.communicate(timeout=10)
    # ---------- static: contrast of design tokens ----------
    def lum(h):
        c = [int(h[i:i+2], 16) / 255 for i in (1, 3, 5)]; c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]; return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
    ratio = lambda a, b: (max(lum(a), lum(b)) + .05) / (min(lum(a), lum(b)) + .05)
    pairs = {'text on panel': ('#E8ECF2', '#141922'), 'dim on panel': ('#A3AEBE', '#141922'), 'dim on step bg': ('#A3AEBE', '#0D1015'), 'silver on card': ('#C9D1DC', '#141922'), 'amber on page': ('#E8A93A', '#0D1015'), 'crimson on panel': ('#E0556C', '#141922'), 'blue-pass on page': ('#8FBFFF', '#0D1015'), 'text on primary button': ('#E8ECF2', '#1F4175'), 'dark text on white node': ('#10151C', '#DDE3EC'), 'dark on amber step badge': ('#1A1204', '#E8A93A')}
    low = {k: round(ratio(*v), 2) for k, v in pairs.items() if ratio(*v) < 4.5}; check('design-token contrast: all text pairs >= 4.5:1 (WCAG AA)', not low, {k: round(ratio(*v), 1) for k, v in pairs.items()} if not low else low)
    check('no console/page errors in any client', not any(any('WebSocket connection' not in m for m in e) for e in errs_all), [m for e in errs_all for m in e])
    print('\nSUMMARY', sum(1 for _, c in res if c), '/', len(res), 'checks passed'); b.close(); sys.exit(0 if all(c for _, c in res) else 1)
