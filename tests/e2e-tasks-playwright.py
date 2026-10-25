# Tasks screen in a real browser. Correct answers below come from the OFFLINE exploration of each position (not from the app's own code).
# Run: python3 tests/e2e-tasks-playwright.py   (needs: pip install playwright && playwright install chromium)
import pathlib, sys
from playwright.sync_api import sync_playwright, Page as _Page
_orig_wff = _Page.wait_for_function
def _wff(self, expression, arg=None, timeout=None, polling=100):
    e = expression.strip()
    if not (e.startswith('(') or e.startswith('function') or e.startswith('async')): e = '() => (' + e + ')'
    return _orig_wff(self, e, arg=arg, timeout=timeout, polling=polling)
_Page.wait_for_function = _wff
ROOT = pathlib.Path(__file__).resolve().parent.parent; FILE = (ROOT / 'index.html').as_uri()
EDGES = ['1-2','2-3','3-4','4-5','5-6','6-7','7-8','8-9','9-10','1-10','2-7','3-8','4-9','5-10']
res = []
def check(name, cond, extra=''):
    res.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(extra) if extra != '' else ''))
INIT = """window.__osc=[];class FakeAC{constructor(){this.state='running';this.currentTime=0;this.destination={}}
 createGain(){return {gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}
 createOscillator(){return {type:'',frequency:{setValueAtTime(f){window.__osc.push(Math.round(f))},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}}resume(){return Promise.resolve()}}
window.AudioContext=FakeAC;"""
FB = '#taskPanel .fb[role=status]'
def fbtext(pg): return pg.inner_text(FB) if pg.locator(FB).count() and pg.is_visible(FB) else ''
def press(btn):
    if btn.get_attribute('aria-pressed') != 'true': btn.click()   # chips toggle: never click an already selected one
def pick(pg, node, act, edge):
    ch = pg.locator('#taskPanel .chips'); press(ch.nth(0).locator('button').nth(node-1)); press(ch.nth(1).locator('button').nth(0 if act == 'CREATE' else 1)); press(ch.nth(2).locator('button').nth(EDGES.index(edge)))
def go_check(pg): pg.locator('#taskPanel .actions button.primary').first.click()
def open_task(pg, i): pg.click('#navTasks') if pg.is_hidden('#screenTasks') else None; (pg.get_by_role('button', name='All tasks').first.click() if pg.locator('#taskPanel').count() else None); pg.locator('.taskcard').nth(i).click(); pg.wait_for_selector('#taskPanel')
def edge_chip(pg, e): pg.locator('#taskPanel .chips button', has_text=e.replace('-', '–')).first.click()
ORDER = ['tut-commit','tut-resolve-win','tut-resolve-conflict','tut-resolve-different','conn-1','conn-2','def-1','def-2','atk-1','atk-2','chl-1','chl-2']
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={'width': 1366, 'height': 800}, locale='en-US'); ctx.add_init_script(INIT); pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(FILE)
    pg.click('#navTasks')
    check('Tasks tab: list of 12 tasks in 5 categories, game screen and history hidden, tab marked current', pg.locator('.taskcard').count() == 12 and pg.locator('#screenTasks h2').count() == 6 and pg.is_hidden('#screenPlay') and pg.is_hidden('#hist') and pg.get_attribute('#navTasks', 'aria-current') == 'page' and pg.get_attribute('#navPlay', 'aria-current') == 'false')
    check('progress starts at 0 of 12', '0 of 12' in pg.inner_text('#screenTasks'), pg.inner_text('#screenTasks')[:120])
    # ---- tutorial: commit ----
    open_task(pg, 0); pg.evaluate('window.__osc.length=0'); pg.locator('.itemlist button').nth(1).click(); pg.locator('#taskPanel .actions button.primary').click()
    check('commit task: a wrong selection gives "Not correct yet", plays the error tone and does NOT mark it solved', 'Not correct yet' in fbtext(pg) and 196 in pg.evaluate('window.__osc'))
    for i in (0, 2, 3, 5):
        if pg.get_attribute(f'.itemlist button >> nth={i}', 'aria-pressed') != 'true': pg.locator('.itemlist button').nth(i).click()
    pg.locator('.itemlist button').nth(1).click(); pg.evaluate('window.__osc.length=0'); pg.locator('#taskPanel .actions button.primary').click()
    check('commit task: the right items (nodes 2,5,7,10) are accepted, explanation shown, beacon tone played', 'Correct!' in fbtext(pg) and 'touches 2 and 7' in fbtext(pg) and 988 in pg.evaluate('window.__osc'), fbtext(pg)[:80])
    # ---- tutorial: resolve ----
    for i, ans_yes in ((1, True), (2, False), (3, True)):
        open_task(pg, i); wrong = pg.locator('#taskPanel .actions button').nth(1 if ans_yes else 0); wrong.click(); w = 'Not correct yet' in fbtext(pg)
        pg.locator('#taskPanel .actions button').nth(0 if ans_yes else 1).click(); check(f'resolve task {i}: wrong answer rejected, right answer accepted with explanation', w and 'Correct!' in fbtext(pg))
    # ---- connectivity ----
    open_task(pg, 4); edge_chip(pg, '1-2'); pg.locator('#taskPanel .actions button.primary').click(); w = 'Not correct yet' in fbtext(pg)
    edge_chip(pg, '2-3'); edge_chip(pg, '3-4'); pg.locator('#taskPanel .actions button.primary').click(); check('conn-1: partial set rejected, {1–2, 2–3, 3–4} accepted', w and 'Correct!' in fbtext(pg))
    open_task(pg, 5)
    for e in ('1-2', '2-3', '3-8'): edge_chip(pg, e)
    sel = pg.evaluate("document.querySelectorAll('#taskBoard .edge.sel').length"); pg.locator('#taskPanel .actions button.primary').click()
    check('conn-2: selection is mirrored on the board (3 highlighted links) and {1–2, 2–3, 3–8} is accepted', sel == 3 and 'Correct!' in fbtext(pg), sel)
    # ---- defense ----
    open_task(pg, 6); pick(pg, 4, 'CREATE', '4-5'); go_check(pg); t1 = fbtext(pg)
    check('def-1: the tempting CREATE 4–5 is rejected and a beating opponent reply is shown', 'Not correct yet' in t1 and 'A reply that beats it' in t1, t1[:140])
    pick(pg, 3, 'CREATE', '3-4'); go_check(pg); check('def-1: CREATE 3–4 accepted', 'Correct!' in fbtext(pg))
    open_task(pg, 6); pick(pg, 3, 'CREATE', '2-7'); go_check(pg); check('def-1: CREATE 2–7 (uncommitted, node 3) is also accepted (second independent path)', 'Correct!' in fbtext(pg))
    open_task(pg, 7); pick(pg, 3, 'CREATE', '1-10'); go_check(pg); w = 'Not correct yet' in fbtext(pg); pick(pg, 1, 'CREATE', '1-10'); go_check(pg)
    check('def-2: uncommitted protection fails, committed CREATE 1–10 succeeds', w and 'Correct!' in fbtext(pg))
    # ---- attack ----
    open_task(pg, 8); pick(pg, 5, 'CREATE', '5-6'); go_check(pg); w = 'Not correct yet' in fbtext(pg); pick(pg, 5, 'CUT', '5-6'); go_check(pg); check('atk-1: CUT 5–6 wins by force; a passive CREATE does not', w and 'Correct!' in fbtext(pg))
    open_task(pg, 9); pick(pg, 2, 'CUT', '6-7'); go_check(pg); w = 'Not correct yet' in fbtext(pg); pick(pg, 6, 'CUT', '6-7'); go_check(pg); check('atk-2: uncommitted block loses, committed CUT 6–7 (even on a missing link) wins', w and 'Correct!' in fbtext(pg))
    pg.get_by_role('button', name='Show solution').click(); sol = pg.inner_text('#taskPanel .sol'); check('"Show solution" lists the engine-computed accepted answer', '6–7' in sol and 'committed only' in sol, sol)
    # ---- challenges ----
    open_task(pg, 10); pick(pg, 1, 'CREATE', '1-2'); go_check(pg); pick(pg, 1, 'CREATE', '1-2'); go_check(pg)   # two idle rounds repeat the start position 3 times: the real engine ends it as a draw
    check('chl-1: idle play fails (threefold repetition = draw, no win) with a clear message and a Reset button', 'Not this time' in fbtext(pg) and pg.get_by_role('button', name='Reset').count() == 1, fbtext(pg)[:100])
    pg.get_by_role('button', name='Reset').click(); pick(pg, 2, 'CUT', '2-3'); go_check(pg); check('chl-1: round counter advances (Round 2 of 3)', 'Round 2 of 3' in pg.inner_text('#taskPanel'))
    pick(pg, 9, 'CUT', '9-10'); go_check(pg); pick(pg, 1, 'CREATE', '1-2'); go_check(pg)
    check('chl-1: the 3-round win is recognised ("Won in 3 rounds!")', 'Won in 3 rounds' in fbtext(pg), fbtext(pg)[:90])
    open_task(pg, 11)
    for node, act, e in ((2, 'CUT', '2-3'), (1, 'CUT', '1-10'), (2, 'CUT', '2-7'), (1, 'CREATE', '1-2')): pick(pg, node, act, e); go_check(pg)
    check('chl-2: the 4-round line through the chords wins (limit 5)', 'Won in 4 rounds' in fbtext(pg), fbtext(pg)[:90])
    pg.get_by_role('button', name='All tasks').first.click()
    check('all 12 tasks solved: progress shows 12 of 12 and every card is marked', '12 of 12' in pg.inner_text('#screenTasks') and pg.locator('.taskcard.done').count() == 12)
    pg.reload(); pg.click('#navTasks'); check('progress persists across a reload', '12 of 12' in pg.inner_text('#screenTasks'))
    pg.get_by_role('button', name='Reset progress').click(); check('reset progress (confirmed) returns to 0 of 12', '0 of 12' in pg.inner_text('#screenTasks'))
    # ---- language, navigation back to the game ----
    pg.select_option('#lang', 'ru'); open_task(pg, 6); check('Russian: task title and description are Russian, chrome too', 'Второй путь' in pg.inner_text('#screenTasks') and 'Проверить' in pg.inner_text('#taskPanel'))
    pg.select_option('#lang', 'es'); check('Spanish: chrome is Spanish, task text falls back to English and a note says so', 'Comprobar' in pg.inner_text('#taskPanel') and 'A second path' in pg.inner_text('#screenTasks'))
    pg.get_by_role('button', name='Todos los retos').click(); check('Spanish list shows the language note', 'solo están disponibles en inglés y ruso' in pg.inner_text('#screenTasks'))
    pg.select_option('#lang', 'en'); pg.click('#navPlay'); check('back to the game: game screen visible again with its controls, tasks hidden', pg.is_visible('#screenPlay') and pg.is_hidden('#screenTasks') and pg.locator('#panel .chips').count() == 3)
    ctx.close()
    # ---- phones ----
    bad = []
    for (w, h) in [(320, 568), (360, 740), (390, 844), (844, 390)]:
        c2 = b.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True, locale='en-US'); q = c2.new_page(); q.on('pageerror', lambda e: errs.append(str(e))); q.goto(FILE); q.tap('#navTasks')
        for i in (None, 0, 6, 10):
            if i is not None:
                if q.locator('#taskPanel').count(): q.get_by_role('button', name='All tasks').first.tap()
                q.locator('.taskcard').nth(i).tap()
            hs = q.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"); small = q.evaluate("[...document.querySelectorAll('button,select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&!e.disabled&&(r.height<43.5||r.width<43.5)}).map(e=>e.className||e.id)")
            bb = q.evaluate("(()=>{const e=document.querySelector('#taskBoard');if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left,r:r.right,w:innerWidth}})()")
            if not hs: bad.append((w, i, 'hscroll'))
            if w <= 430 and h > w and small: bad.append((w, i, 'targets', small))
            if bb and not (bb['l'] >= -0.5 and bb['r'] <= bb['w'] + 0.5): bad.append((w, i, 'board outside'))
        c2.close()
    check('phones 320/360/390 and landscape 844x390: tasks list and task views have no horizontal scroll, 44px targets, board inside the screen', not bad, bad)
    c3 = b.new_context(viewport={'width': 360, 'height': 740}, locale='en-US'); z = c3.new_page(); z.goto(FILE); z.click('#navTasks'); bad = []
    for L in ['en', 'ru', 'it', 'fr', 'es', 'de', 'pt', 'ja', 'ko', 'zh', 'ar']:
        z.select_option('#lang', L)
        for i in (None, 7):
            if i is not None:
                if z.locator('#taskPanel').count(): z.locator('#screenTasks > button').first.click()
                z.locator('.taskcard').nth(i).click()
            o = z.evaluate("(()=>{const d=document.documentElement,bad=[];if(d.scrollWidth>d.clientWidth+1)bad.push('hscroll');document.querySelectorAll('#screenTasks button,#screenTasks .fb,.tab').forEach(e=>{if(e.scrollWidth>e.clientWidth+2)bad.push(e.className+':'+(e.textContent||'').slice(0,14))});return bad})()")
            if o: bad.append((L, i, o[:2]))
        if z.locator('#taskPanel').count(): z.locator('#screenTasks > button').first.click()
    check('tasks screen at 360px in all 11 languages: no overflow or clipping (list and a task view)', not bad, bad); c3.close()
    check('no console/page errors', not errs, errs)
    print('\nSUMMARY', sum(1 for _, c in res if c), '/', len(res), 'checks passed'); b.close(); sys.exit(0 if all(c for _, c in res) else 1)
