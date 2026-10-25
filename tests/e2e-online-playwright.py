# Real-browser, real-server check of online play (two separate browser contexts = two profiles).
# Needs: npm install (for ws), pip install playwright && playwright install chromium.  Run: python3 tests/e2e-online-playwright.py
import json, os, re, socket, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright
from playwright.sync_api import Page as _Page
_orig_wff = _Page.wait_for_function   # default polling is requestAnimationFrame, which can stall on a page that is not being rendered; poll on a timer instead
def _wff(self, expression, arg=None, timeout=None, polling=100):
    e = expression.strip()   # pages served with our CSP forbid eval: always hand Playwright a function, never a bare expression string
    if not (e.startswith('(') or e.startswith('function') or e.startswith('async')): e = '() => (' + e + ')'
    return _orig_wff(self, e, arg=arg, timeout=timeout, polling=polling)
_Page.wait_for_function = _wff
ROOT = pathlib.Path(__file__).resolve().parent.parent
EDGES = ['1-2','2-3','3-4','4-5','5-6','6-7','7-8','8-9','9-10','1-10','2-7','3-8','4-9','5-10']
res = []
def menu(pg, sel): pg.click('#menuBtn'); pg.click(sel)   # rarely used actions live in the "More" menu
def check(name, cond, extra=''):
    res.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(extra) if extra != '' else ''))
def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
class Server:
    def __init__(self, port): self.port = port; self.p = None; self.out = ''
    def start(self):
        env = dict(os.environ, PORT=str(self.port)); self.p = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for _ in range(100):
            try: socket.create_connection(('127.0.0.1', self.port), 0.2).close(); return
            except OSError: time.sleep(0.05)
        raise RuntimeError('server did not start')
    def stop(self):
        if self.p: self.p.terminate(); self.out += self.p.communicate(timeout=10)[0]; self.p = None
PORT = free_port(); BASE = f'http://127.0.0.1:{PORT}/'; srv = Server(PORT); srv.start()
OVER = """()=>{const bad=[];const d=document.documentElement;if(d.scrollWidth>d.clientWidth+1)bad.push('hscroll');document.querySelectorAll('button,select,.card,.chip,#panel,.banner,dialog,input').forEach(e=>{if(e.scrollWidth>e.clientWidth+2)bad.push(e.tagName+'.'+(e.id||e.className)+':'+(e.textContent||'').slice(0,18))});return bad}"""
def pick(pg, node, act, edge, confirm=True):
    ch = pg.locator('#panel .chips'); ch.nth(0).locator('button').nth(node-1).click(); ch.nth(1).locator('button').nth(0 if act == 'CREATE' else 1).click(); ch.nth(2).locator('button').nth(EDGES.index(edge)).click()
    if confirm: pg.locator('#panel .actions button').nth(0).click()
def new_page(browser, size=(1280, 800)):
    ctx = browser.new_context(viewport={'width': size[0], 'height': size[1]}, locale='en-US'); pg = ctx.new_page(); errs = []; frames = []; pg.on('dialog', lambda d: d.accept())
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('websocket', lambda ws: ws.on('framereceived', lambda p: frames.append(p if isinstance(p, str) else p.decode())))
    return ctx, pg, errs, frames
def wait(pg, js, t=6000): pg.wait_for_function(js, timeout=t)
def online_create(pg):
    pg.click('#onlineBtn'); pg.click('#onlineCreate'); wait(pg, "document.querySelector('#onlineCodeShown').textContent.length===6"); code = pg.inner_text('#onlineCodeShown'); return code
def online_join(pg, code):
    pg.click('#onlineBtn'); pg.fill('#onlineCode', code); pg.click('#onlineJoin')
with sync_playwright() as p:
    b = p.chromium.launch(); all_errs = []
    ctxA, A, eA, fA = new_page(b); ctxB, Bp, eB, fB = new_page(b); all_errs += [eA, eB]
    A.goto(BASE); Bp.goto(BASE)
    # --- room creation / join ---
    code = online_create(A); check('A creates a room: 6-char code from the safe alphabet', re.fullmatch(r'[A-HJ-NP-Z2-9]{6}', code), code)
    check('A in the lobby: waiting-for-opponent status shown, link badge says White', 'White' in A.inner_text('#onlineBadge') and A.inner_text('#onlineStatus') != '', A.inner_text('#onlineBadge'))
    A.click('#onlineCopy'); A.wait_for_timeout(300); check('Copy button gives feedback (clipboard or manual fallback)', A.inner_text('#onlineStatus').count(' ') > 2 or A.locator('#onlineCopyBox').is_visible(), A.inner_text('#onlineStatus'))
    A.click('#onlineClose'); check('A sees the neutral waiting screen with the code, no picker', A.locator('#panel .chips').count() == 0 and code in A.inner_text('#panel'))
    online_join(Bp, code.lower()); wait(Bp, "document.querySelector('#onlineCodeShown').textContent.length===6"); Bp.click('#onlineClose')
    wait(A, "document.querySelectorAll('#panel .chips').length===3"); wait(Bp, "document.querySelectorAll('#panel .chips').length===3")
    check('seats: creator is White, joiner is Black (badges)', 'White' in A.inner_text('#onlineBadge') and 'Black' in Bp.inner_text('#onlineBadge'), (A.inner_text('#onlineBadge'), Bp.inner_text('#onlineBadge')))
    check('both see "Opponent" on the other card and a connected status', 'Opponent' in A.inner_text('#cards') and 'Opponent' in Bp.inner_text('#cards') and 'Opponent connected' in A.inner_text('#onlineBadge'), A.inner_text('#onlineBadge'))
    check('local-only controls are disabled online (new/mode/undo/export/import) and undo is explained', all(A.locator(q).is_disabled() for q in ['#new', '#mode', '#undo', '#exportBtn', '#importBtn']) and A.inner_text('#notice') != '', A.inner_text('#notice'))
    # --- third client cannot take the seat ---
    ctxC, C, eC, fC = new_page(b); all_errs.append(eC); C.goto(BASE); online_join(C, code); C.wait_for_timeout(500)
    check('third client: "room already has two players", no seat', 'two players' in C.inner_text('#onlineError') and C.locator('#onlineRoom').is_hidden(), C.inner_text('#onlineError'))
    ctxC.close()
    # --- hidden choice ---
    pick(A, 3, 'CUT', '2-3')
    A.wait_for_timeout(400); Bp.wait_for_timeout(100)
    leakA = A.evaluate("()=>({on:document.querySelectorAll('#panel .chip.on').length,sel:document.querySelectorAll('.edge.sel').length,intent:document.querySelectorAll('.node.intent').length,chips:document.querySelectorAll('#panel .chips').length,halo:document.querySelectorAll('.edge.halo').length,badge:document.querySelectorAll('.badge').length,h2:document.querySelector('#panel h2').textContent})")
    check("A after confirming: neutral waiting screen, no selection left on board/DOM", leakA['on'] == 0 and leakA['sel'] == 0 and leakA['intent'] == 0 and leakA['chips'] == 0 and leakA['halo'] == 0 and leakA['badge'] == 0, leakA)
    storeA = A.evaluate("Object.assign({},localStorage)"); onl = json.loads(storeA['nori.online.v1']); loc = json.loads(storeA['nori.save.v1'])
    check("A's online storage key holds only {tokens, last}; the local autosave stays an untouched empty local game; no choice anywhere", sorted(onl.keys()) == ['last', 'tokens'] and loc['rounds'] == [] and '"CUT"' not in json.dumps(storeA), list(storeA.keys()))
    check('A: URL unchanged (no choice in URL)', A.url == BASE, A.url)
    wait(Bp, "document.querySelector('#cards').innerText.includes('Choice made')"); check('B only learns that the opponent has locked a choice', 'Choice made' in Bp.inner_text('#cards'))
    domB = Bp.evaluate("document.documentElement.outerHTML")
    check('B: wire frames so far contain no action/edge of the hidden choice', not any('"CUT"' in f or '"node"' in f for f in fB), len(fB))
    check('B: nothing on the board betrays the choice (no halo, badge, selection)', Bp.locator('.edge.halo').count() == 0 and Bp.locator('.badge').count() == 0 and Bp.locator('.edge.sel').count() == 0)
    pick(Bp, 8, 'CREATE', '3-8')
    wait(A, "document.querySelectorAll('.badge').length===2"); wait(Bp, "document.querySelectorAll('.badge').length===2")
    la = A.inner_text('#panel'); lb = Bp.inner_text('#panel')
    check('reveal: both clients show both choices and an identical result panel', 'Cut' in la and 'Create' in la and la == lb, la.split('\n')[:5])
    check('journal on both sides has the completed round', A.locator('#log li').count() == 1 and Bp.locator('#log li').count() == 1)
    check('wire: reveal arrives only after both chose (B frames now contain the choices)', any('round_resolved' in f for f in fB))
    A.locator('#panel button').first.click(); Bp.locator('#panel button').first.click()
    wait(A, "document.querySelectorAll('#panel .chips').length===3"); check('"Next round" is local UI only: round 2 picking on both', 'Round 2' in A.inner_text('#panel h2') and 'Round 2' in Bp.inner_text('#panel h2'), A.inner_text('#panel h2'))
    # --- reload / reconnect with pending choice ---
    pick(A, 1, 'CREATE', '1-2'); A.wait_for_timeout(300); A.reload(); wait(A, "document.querySelector('#onlineBadge').textContent.includes('White')")
    A.wait_for_timeout(500)
    check('A reloads mid-round: seat restored by token (still White), choice remains locked, no choice shown', 'White' in A.inner_text('#onlineBadge') and A.locator('#panel .chips').count() == 0 and A.locator('.edge.sel').count() == 0, A.inner_text('#panel h2'))
    check('B saw the disconnect only as a status and keeps playing; no choice leaked to B', not any('"CREATE"' in f and '1-2' in f and 'round_resolved' not in f and 'snapshot' not in f for f in fB))
    pick(Bp, 5, 'CREATE', '5-6')
    wait(A, "document.querySelectorAll('.badge').length===2", 8000); wait(Bp, "document.querySelectorAll('.badge').length===2")
    check('after A reconnected, round 2 resolved for both; A (reloaded) sees 2 journal rows', A.locator('#log li').count() == 2 and Bp.locator('#log li').count() == 2, A.locator('#log li').count())
    A.locator('#panel button').first.click(); Bp.locator('#panel button').first.click()
    # --- finish game: draw by repetition ---
    for r in range(3, 6):
        if A.locator('#panel .banner').count(): break
        wait(A, "document.querySelectorAll('#panel .chips').length===3"); wait(Bp, "document.querySelectorAll('#panel .chips').length===3")
        pick(A, 1, 'CREATE', '1-2'); pick(Bp, 5, 'CREATE', '5-6'); wait(A, "document.querySelectorAll('.badge').length===2", 8000); wait(Bp, "document.querySelectorAll('.badge').length===2")
        if not A.locator('#panel .banner').count(): A.locator('#panel button').first.click(); Bp.locator('#panel button').first.click()
    wait(A, "document.querySelector('#panel .banner')"); wait(Bp, "document.querySelector('#panel .banner')")
    check('terminal result (draw) is shown to both clients', 'Draw' in A.inner_text('#panel .banner') and 'Draw' in Bp.inner_text('#panel .banner'), A.inner_text('#panel .banner'))
    # --- leave -> local modes intact ---
    A.locator('#panel button').last.click(); A.wait_for_timeout(200)
    check('A leaves online: local controls enabled again, local game starts fresh', not A.locator('#new').is_disabled() and not A.locator('#mode').is_disabled() and A.locator('#log li').count() == 0)
    pick(A, 1, 'CREATE', '1-2'); A.locator('#panel button').first.click(); pick(A, 5, 'CREATE', '5-6'); check('local hot-seat round works after leaving online', A.locator('#log li').count() == 1)
    A.select_option('#mode', 'ai'); pick(A, 1, 'CREATE', '1-2'); check('local vs-AI works', A.locator('#log li').count() == 1 and A.locator('.badge').count() == 2)
    A.reload(); A.wait_for_timeout(400); check('after reload A is local (online last-room was cleared by leaving) and local autosave restored', A.locator('#onlineBadge').inner_text() == '' and A.locator('#log li').count() == 1)
    # --- file:// shows the "needs server" message ---
    F = ctxA.new_page(); F.goto((ROOT / 'index.html').as_uri()); F.click('#onlineBtn'); check('opened from file://: online explains it needs the server', F.inner_text('#onlineNeeds') != '', F.inner_text('#onlineNeeds')); F.close()
    # --- server restart: rooms are in memory ---
    ctxD, D, eD, fD = new_page(b); ctxE, E, eE, fE = new_page(b); all_errs += [eD, eE]; D.goto(BASE); E.goto(BASE)
    code2 = online_create(D); D.click('#onlineClose'); online_join(E, code2); wait(E, "document.querySelector('#onlineCodeShown').textContent.length===6"); E.click('#onlineClose'); wait(D, "document.querySelectorAll('#panel .chips').length===3")
    srv.stop(); D.wait_for_timeout(1800)
    check('server down: clients show reconnecting (not "connected"), no new game started', 'Reconnecting' in D.inner_text('#onlineBadge') or 'reconnect' in D.inner_text('#onlineBadge').lower(), D.inner_text('#onlineBadge'))
    srv.start(); wait(D, "() => document.querySelector('#onlineBadge').textContent === '' && document.querySelector('#notice').textContent.length > 0", 15000)
    check('after restart the room is gone: clear message, D returns to local mode', 'no longer exists' in D.inner_text('#notice') and not D.locator('#new').is_disabled(), D.inner_text('#notice'))
    # --- narrow screens / languages ---
    ctxM, M, eM, fM = new_page(b, (375, 740)); all_errs.append(eM); M.goto(BASE); bad = []
    for L in ['de', 'ja', 'ar', 'fr', 'ko']:
        M.select_option('#lang', L); M.click('#onlineBtn'); o = M.evaluate(OVER); M.click('#onlineClose'); 
        if o: bad.append((L, o))
    check('online dialog at 375px in de/ja/ar/fr/ko: no overflow or clipping', not bad, bad)
    M.select_option('#lang', 'ar'); M.screenshot(path='/tmp/online_ar_375.png', full_page=True)
    srv.stop()
    for ctx in (ctxA, ctxB, ctxD, ctxE, ctxM): ctx.close()
    expected = lambda m: 'ERR_CONNECTION_REFUSED' in m and 'WebSocket connection' in m   # Chromium logs this itself while the server is deliberately stopped
    leftover = [m for lst in all_errs for m in lst if not expected(m)]
    check('no console/page errors in any client (only the browser\'s own connection-refused notes while the server was stopped are ignored)', not leftover, leftover)
    tokens = re.findall(r'"token":"([^"]+)"', ''.join(fA + fB + fD + fE))
    check('server stdout never contains a seat token or any choice (only the startup line)', all(t not in srv.out for t in tokens) and '"CUT"' not in srv.out and srv.out.count('listening') == 2, srv.out.strip().replace('\n', ' | ')[:200])
    print('\nSUMMARY', sum(1 for _, c in res if c), '/', len(res), 'checks passed'); b.close(); sys.exit(0 if all(c for _, c in res) else 1)
