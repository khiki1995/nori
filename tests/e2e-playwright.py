# Optional browser end-to-end check (needs: pip install playwright && playwright install chromium). Run: python3 tests/e2e-playwright.py
from playwright.sync_api import sync_playwright
from playwright.sync_api import Page as _Page
_orig_wff = _Page.wait_for_function   # default polling is requestAnimationFrame, which can stall on a page that is not being rendered; poll on a timer instead
def _wff(self, expression, arg=None, timeout=None, polling=100):
    e = expression.strip()   # pages served with our CSP forbid eval: always hand Playwright a function, never a bare expression string
    if not (e.startswith('(') or e.startswith('function') or e.startswith('async')): e = '() => (' + e + ')'
    return _orig_wff(self, e, arg=arg, timeout=timeout, polling=polling)
_Page.wait_for_function = _wff
import pathlib, json
url=(pathlib.Path(__file__).resolve().parent.parent/'index.html').as_uri()
EDGES=['1-2','2-3','3-4','4-5','5-6','6-7','7-8','8-9','9-10','1-10','2-7','3-8','4-9','5-10']
LANGS=['en','ru','it','fr','es','de','pt','ja','ko','zh','ar']
OVER="""()=>{const bad=[];const d=document.documentElement;if(d.scrollWidth>d.clientWidth+1)bad.push('hscroll '+d.scrollWidth+'>'+d.clientWidth);
document.querySelectorAll('button,select,.card,.chip,#panel,.banner').forEach(e=>{if(e.scrollWidth>e.clientWidth+2)bad.push(e.tagName+'.'+e.className+':'+(e.textContent||'').slice(0,18))});return bad}"""

def click_edge(pg,edge,f=0.25):
    import math
    a,b=[int(x) for x in edge.split('-')]
    def pos(i):
        t=(-90+(i-1)*36)*math.pi/180; return 260+205*math.cos(t),260+205*math.sin(t)
    (x1,y1),(x2,y2)=pos(a),pos(b); x=x1+(x2-x1)*f; y=y1+(y2-y1)*f
    bb=pg.locator('#board').bounding_box(); sc=min(bb['width'],bb['height'])/520
    ox=bb['x']+(bb['width']-520*sc)/2; oy=bb['y']+(bb['height']-520*sc)/2
    pg.mouse.click(ox+x*sc,oy+y*sc)
res=[]
def menu(pg, sel): pg.click('#menuBtn'); pg.click(sel)   # rarely used actions live in the "More" menu
def check(name,cond,extra=''):
    res.append((name,bool(cond))); print(('PASS ' if cond else 'FAIL ')+name+(' | '+str(extra) if extra!='' else ''))
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    ctx=b.new_context(viewport={'width':1280,'height':800},locale='sv-SE',accept_downloads=True); pg=ctx.new_page()
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.on('dialog',lambda d: d.accept())
    pg.goto(url)
    def pick(node,act,edge,via='chips'):
        if via=='chips':
            ch=pg.locator('#panel .chips'); ch.nth(0).locator('button').nth(node-1).click(); ch.nth(1).locator('button').nth(0 if act=='CREATE' else 1).click(); ch.nth(2).locator('button').nth(EDGES.index(edge)).click()
        pg.locator('#panel .actions button').nth(0).click()
    check('starts, fallback language English for sv-SE', pg.evaluate('document.documentElement.lang')=='en')
    check('14 edge hit-targets incl. absent chords', pg.locator('#board .hit').count()==14)
    # board clicks: node + ABSENT edge + keyboard
    pg.locator('#board [aria-label="node 2"]').click()  # node 2 is a Beacon (square)
    click_edge(pg,'2-7')   # absent chord, real mouse click 25% along it
    check('click on node and on absent edge selects them', pg.locator('#board .node.intent').count()==1 and pg.locator('#board .edge.sel').count()==1)
    check('commitment explanation shown (committed, node 2 touches 2-7)', 'node 2' in pg.locator('#panel p.hint[role=status]').inner_text() and pg.locator('#panel p.hint.warn').count()==0, pg.locator('#panel p.hint[role=status]').inner_text())
    pg.locator('#board .hit').nth(EDGES.index('5-10')).focus(); pg.keyboard.press('Enter')
    check('keyboard Enter selects an edge', pg.locator('#board .edge.sel').count()==1 and pg.evaluate("document.querySelector('#panel p.hint.warn')!==null"))
    click_edge(pg,'2-7'); pg.locator('#panel .chips').nth(1).locator('button').nth(0).click()
    pg.locator('#panel .actions button').nth(0).click()   # White: node2 CREATE 2-7 (committed)
    # hidden choice at DOM level
    leak=lambda: pg.evaluate("""()=>({sel:document.querySelectorAll('.edge.sel').length,halo:document.querySelectorAll('.edge.halo').length,badge:document.querySelectorAll('.badge').length,intent:document.querySelectorAll('.node.intent').length,on:document.querySelectorAll('#panel .chip.on').length,log:document.querySelectorAll('#log li').length,hit:document.querySelectorAll('.hit').length})""")
    l=leak(); check('hot-seat handoff screen: no trace of White choice in DOM', l=={'sel':0,'halo':0,'badge':0,'intent':0,'on':0,'log':0,'hit':0}, l)
    storedMid=pg.evaluate("localStorage.getItem('nori.save.v1')"); check('autosave exists and holds no pending choice (0 rounds)', storedMid and json.loads(storedMid)['rounds']==[])
    pg.locator('#panel button').first.click(); l=leak(); check('Black picking screen: no trace of White choice', l['sel']==0 and l['halo']==0 and l['badge']==0 and l['on']==0 and l['log']==0, l)
    pick(7,'CUT','2-7')
    check('reveal shows conflict, 2 badges, log row', pg.locator('#panel .ln.cf').count()==1 and pg.locator('.badge').count()==2 and pg.locator('#log li').count()==1)
    check('autosave after round', json.loads(pg.evaluate("localStorage.getItem('nori.save.v1')"))['rounds'].__len__()==1)
    # reload restores
    pg.reload(); check('reload restores the saved game (1 round in log, undo enabled)', pg.locator('#log li').count()==1 and not pg.locator('#undo').is_disabled())
    # undo
    pg.locator('#undo').click(); check('Undo button works: log empty, undo disabled', pg.locator('#log li').count()==0 and pg.locator('#undo').is_disabled())
    # play a round again then export / import
    pick(1,'CREATE','1-2'); pg.locator('#panel button').first.click(); pick(5,'CREATE','5-6')
    with pg.expect_download() as dl: menu(pg, '#exportBtn')
    path=dl.value.path(); exported=open(path,encoding='utf8').read(); j=json.loads(exported)
    check('Export downloads valid JSON with 1 round', j['game']=='NORI' and len(j['rounds'])==1, dl.value.suggested_filename)
    pg.locator('#new').click(); check('New game (confirm accepted) clears history', pg.locator('#log li').count()==0)
    menu(pg, '#importBtn'); pg.fill('#importText','{{'); pg.locator('#importLoad').click(); msg=pg.locator('#importMsg').inner_text()
    check('Import: invalid JSON shows error and keeps dialog/game', msg!='' and pg.locator('#log li').count()==0, msg)
    bad=json.loads(exported); bad['rounds'][0]['choices'][0]['edge']='1-5'; pg.fill('#importText',json.dumps(bad)); pg.locator('#importLoad').click(); check('Import: unknown edge rejected', pg.locator('#importMsg').inner_text()!='' and pg.locator('#log li').count()==0, pg.locator('#importMsg').inner_text())
    pg.set_input_files('#file',path); pg.wait_for_timeout(200); check('Import: file chooser fills textarea', len(pg.input_value('#importText'))>50)
    pg.locator('#importLoad').click(); check('Import: valid file loads the game (1 round, notice shown)', pg.locator('#log li').count()==1 and pg.locator('#notice').inner_text()!='')
    # rules dialog
    menu(pg, '#rules'); check('Rules dialog opens with 5 paragraphs', pg.locator('#rulesBody p').count()==5 and pg.locator('#dlgRules').evaluate('d=>d.open')); pg.locator('#rulesClose').click(); check('Rules dialog closes', not pg.locator('#dlgRules').evaluate('d=>d.open'))
    # selftest
    menu(pg, '#selftest'); pg.wait_for_timeout(300); title=pg.locator('#tests h2').inner_text(); nfail=pg.locator('#tests .fail').count(); npass=pg.locator('#tests .pass').count(); nskip=pg.locator('#tests .hint').count()
    check('Self-check: real counts, 0 failures', nfail==0 and npass>=50, f'{title} | pass={npass} fail={nfail} skipped(node-only)={nskip}')
    # AI mode
    pg.select_option('#mode','ai'); pick(1,'CREATE','1-2'); check('Human vs AI: one confirm reveals both choices', pg.locator('#panel .ln').count()>=3 and pg.locator('.badge').count()==2)
    # 11 languages x desktop/mobile
    for size in [(1280,800),(375,740)]:
        ctx2=b.new_context(viewport={'width':size[0],'height':size[1]},locale='sv-SE'); q=ctx2.new_page(); q.on('pageerror',lambda e: errs.append(str(e))); q.on('console',lambda m: errs.append(m.text) if m.type=='error' else None); q.on('dialog',lambda d: d.accept()); q.goto(url)
        bad=[]; flips=set()
        for L in LANGS:
            q.select_option('#lang',L); d=q.evaluate('[document.documentElement.lang,document.documentElement.dir]')
            if d!=[L,'rtl' if L=='ar' else 'ltr']: bad.append(('dir',L,d))
            q.locator('#new').click(); iss=q.evaluate(OVER)
            ch=q.locator('#panel .chips'); ch.nth(0).locator('button').nth(1).click(); ch.nth(1).locator('button').nth(0).click(); ch.nth(2).locator('button').nth(10).click(); q.locator('#panel .actions button').nth(0).click(); iss+=q.evaluate(OVER)
            q.locator('#panel button').first.click(); ch=q.locator('#panel .chips'); ch.nth(0).locator('button').nth(6).click(); ch.nth(1).locator('button').nth(1).click(); ch.nth(2).locator('button').nth(10).click(); q.locator('#panel .actions button').nth(0).click(); iss+=q.evaluate(OVER)
            menu(q, '#rules'); iss+=q.evaluate(OVER); q.locator('#rulesClose').click()
            flips.add(q.evaluate("(()=>{const s=document.querySelector('#board').getBoundingClientRect(),n=document.querySelector('#board text.lbl').getBoundingClientRect();return Math.round((n.x-s.x)/s.width*100)+','+Math.round((n.y-s.y)/s.height*100)})()"))
            if iss: bad.append((L,iss))
        check(f'11 languages @ {size[0]}px: no overflow/clipping/h-scroll, correct dir', not bad, bad)
        check(f'board geometry identical in all 11 languages (Arabic not mirrored) @ {size[0]}px', len(flips)==1, flips)
        if size[0]==375: q.select_option('#lang','de'); q.screenshot(path='/tmp/e2e_de_375.png',full_page=True)
        if size[0]==1280: q.select_option('#lang','ar'); q.screenshot(path='/tmp/e2e_ar_1280.png',full_page=True); q.select_option('#lang','ja'); q.reload(); check('language persists after reload (ja)', q.evaluate('document.documentElement.lang')=='ja' and q.input_value('#lang')=='ja')
        ctx2.close()
    # storage unavailable
    ctx3=b.new_context(); r=ctx3.new_page(); r.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('denied')}})"); r.on('pageerror',lambda e: errs.append('NOSTORE '+str(e))); r.goto(url)
    check('works without localStorage and says so', r.locator('#save').inner_text()!='' and r.locator('#panel .chips').count()==3, r.locator('#save').inner_text()); ctx3.close()
    check('no console/page errors', not errs, errs)
    print('\nSUMMARY', sum(1 for _,c in res if c),'/',len(res),'checks passed'); b.close()
