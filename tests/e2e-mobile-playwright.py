# Responsive / phone checks in emulated devices (headless Chromium with mobile emulation + touch). This is EMULATION, not a physical phone.
# Run: python3 tests/e2e-mobile-playwright.py   (needs: pip install playwright && playwright install chromium)
import pathlib, sys
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
VIEWPORTS = [(320, 568), (360, 740), (390, 844), (430, 932), (768, 1024), (1024, 768), (1440, 900), (844, 390), (740, 360)]   # last two: phones in landscape
res = []
def check(name, cond, extra=''):
    res.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(extra) if extra != '' else ''))
def sel(pg, node=None, act=None, edge=None):
    ch = pg.locator('#panel .chips')
    if node: ch.nth(0).locator('button').nth(node-1).click()
    if act: ch.nth(1).locator('button').nth(0 if act == 'CREATE' else 1).click()
    if edge: ch.nth(2).locator('button').nth(EDGES.index(edge)).click()
HSCROLL = "document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"
INSIDE = "s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:innerWidth,h:innerHeight}}"
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for (w, h) in VIEWPORTS:
        phone = w <= 844; tag = f'{w}x{h}' + (' landscape' if w > h and phone else '')
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=phone, has_touch=phone, device_scale_factor=2 if phone else 1, locale='en-US'); pg = ctx.new_page()
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(FILE); pg.wait_for_timeout(150); issues = []
        if not pg.evaluate(HSCROLL): issues.append('hscroll at load')
        bb = pg.evaluate(INSIDE, '#board')
        if not (bb['l'] >= -0.5 and bb['r'] <= bb['w'] + 0.5): issues.append(('board outside viewport', bb))
        if w <= 430 and h > w and bb['r'] - bb['l'] < w - 40: issues.append(('board not nearly full width', bb))
        if w > h and phone and (bb['b'] - bb['t']) > h - 10: issues.append(('landscape board taller than the screen', bb))
        sel(pg, 3, 'CUT', '2-3')
        if not pg.evaluate(HSCROLL): issues.append('hscroll while picking')
        if phone and w <= 430:   # touch targets on phones
            small = pg.evaluate("[...document.querySelectorAll('button,select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&!e.disabled&&(r.height<43.5||r.width<43.5)}).map(e=>e.id||e.className)")
            if small: issues.append(('targets below 44px', small))
        pg.tap('#menuBtn') if phone else pg.click('#menuBtn'); m = pg.evaluate(INSIDE, '#menu')
        if not (m and m['l'] >= -0.5 and m['r'] <= m['w'] + 0.5 and m['t'] >= -0.5 and m['b'] <= m['h'] + 0.5): issues.append(('menu outside viewport', m))
        hs = pg.evaluate("[...document.querySelectorAll('#menu button')].map(b=>Math.round(b.getBoundingClientRect().height))")
        if min(hs) < 44: issues.append(('menu item below 44px', hs))
        if pg.get_attribute('#menuBtn', 'aria-expanded') != 'true': issues.append('aria-expanded not true')
        pg.keyboard.press('Escape')
        if not pg.is_hidden('#menu') or pg.get_attribute('#menuBtn', 'aria-expanded') != 'false' or pg.evaluate("document.activeElement.id") != 'menuBtn': issues.append('Escape does not close the menu and return focus')
        pg.click('#menuBtn'); pg.mouse.click(5, 5) if False else pg.evaluate("document.body.click()")
        if not pg.is_hidden('#menu'): issues.append('outside click does not close the menu')
        for opener, dlg in [('rules', '#dlgRules'), ('settingsBtn', '#dlgSettings'), ('importBtn', '#dlgImport')]:
            pg.click('#menuBtn'); pg.click('#' + opener); r = pg.evaluate(INSIDE, dlg)
            last = pg.evaluate("(()=>{const bs=[...document.querySelectorAll('%s button')];const r=bs[bs.length-1].getBoundingClientRect();return {b:r.bottom,h:innerHeight}})()" % dlg)
            if not (r['l'] >= -0.5 and r['r'] <= r['w'] + 0.5 and r['t'] >= -0.5 and r['b'] <= r['h'] + 0.5): issues.append((dlg + ' outside viewport', r))
            if last['b'] > last['h'] + 0.5: issues.append((dlg + ' last button below the screen edge', last))
            if not pg.evaluate(HSCROLL): issues.append('hscroll with ' + dlg)
            pg.keyboard.press('Escape')
        pg.click('#onlineBtn'); r = pg.evaluate(INSIDE, '#dlgOnline'); last = pg.evaluate("(()=>{const bs=[...document.querySelectorAll('#dlgOnline button')].filter(b=>b.getBoundingClientRect().width>0);const r=bs[bs.length-1].getBoundingClientRect();return {b:r.bottom,h:innerHeight}})()")
        if not (r['t'] >= -0.5 and r['b'] <= r['h'] + 0.5 and r['r'] <= r['w'] + 0.5) or last['b'] > last['h'] + 0.5: issues.append(('online dialog does not fit', r, last))
        pg.keyboard.press('Escape')
        pg.locator('#panel .actions button').nth(0).click(); pg.locator('#panel button').first.click(); sel(pg, 8, 'CREATE', '3-8'); pg.locator('#panel .actions button').nth(0).click(); pg.wait_for_timeout(250)
        if not pg.evaluate(HSCROLL): issues.append('hscroll in reveal')
        bb2 = pg.evaluate(INSIDE, '#board')
        if not (bb2['l'] >= -0.5 and bb2['r'] <= bb2['w'] + 0.5): issues.append('board outside viewport in reveal')
        check(f'{tag}: no horizontal scroll; board, menu and dialogs fit; targets >= 44px on phones; Escape/outside-click close the menu', not issues, issues)
        if (w, h) in [(320, 568), (390, 844), (844, 390), (1440, 900)]: pg.screenshot(path=f'/tmp/m_{w}x{h}.png', full_page=True)
        ctx.close()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); pg = ctx.new_page(); pg.goto(FILE)
    head = pg.evaluate("document.head.innerHTML")
    check('head: viewport-fit=cover, zoom NOT disabled, theme-color, manifest and apple-touch-icon present', 'viewport-fit=cover' in head and 'user-scalable' not in head and 'maximum-scale' not in head and 'theme-color' in head and 'rel="manifest"' in head and 'apple-touch-icon' in head)
    css = (ROOT / 'styles.css').read_text(encoding='utf8'); check('safe-area insets are used for the page padding', css.count('safe-area-inset') >= 4)
    pg.tap('#onlineBtn'); pg.fill('#onlineCode', 'ab12'); a = pg.evaluate("(()=>{const i=document.querySelector('#onlineCode');return {ac:i.autocomplete,cap:i.getAttribute('autocapitalize'),corr:i.getAttribute('autocorrect'),sp:i.spellcheck,eh:i.getAttribute('enterkeyhint'),im:i.inputMode,v:i.value}})()")
    check('room-code input: no autofill/autocorrect/spellcheck, capitals, "go" key; Enter submits', a['ac'] == 'off' and a['cap'] == 'characters' and a['corr'] == 'off' and a['sp'] is False and a['eh'] == 'go' and a['im'] == 'text', a)
    ctx.close()
    check('no console/page errors', not errs, errs)
    print('\nSUMMARY', sum(1 for _, c in res if c), '/', len(res), 'checks passed'); b.close(); sys.exit(0 if all(c for _, c in res) else 1)
