(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {})['ui-smoke'] = f; })(this, function (N, H, env) {
const { suite, eq, deq, ok, throwsCode, C } = H, { results, t } = suite(), K = N.controller, St = N.storage, S = N.state;
env = env || {};
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
// A "choice-shaped" object anywhere in a view would be a hidden-choice leak.
const hasChoiceShape = o => { if (!o || typeof o !== 'object') return false; if ('node' in o && 'action' in o && 'edge' in o) return true; return Object.values(o).some(hasChoiceShape); };
const WHITE = C(3, 'CUT', '2-3'), BLACK = C(8, 'CREATE', '3-8');
t('hot-seat: after White confirms, the public view contains no choice, then Black picks blind', () => {
  const s = K.createSession('hvh'); K.submitChoice(s, WHITE); let v = K.getPublicView(s);
  eq(v.phase, 'handoff'); deq(v.hasPending, [true, false]); ok(!hasChoiceShape(v), 'leak in handoff view'); ok(!JSON.stringify(v).includes('"pending"')); eq(v.lastRound, null); eq(v.rounds.length, 0);
  K.proceedFromHandoff(s); v = K.getPublicView(s); eq(v.phase, 'pick'); eq(v.turn, 1); ok(!hasChoiceShape(v), 'leak in Black view'); deq(v.edges, N.C.RING);
});
t('hot-seat: both choices are revealed together after Black confirms', () => {
  const s = K.createSession('hvh'); K.submitChoice(s, WHITE); K.proceedFromHandoff(s); K.submitChoice(s, BLACK); const v = K.getPublicView(s);
  eq(v.phase, 'reveal'); deq(v.hasPending, [false, false]); deq(v.lastRound.choices, [WHITE, BLACK]); deq(v.lastRound.commitments, [true, true]); ok(!v.edges.includes('2-3')); ok(v.edges.includes('3-8'));
});
t('vs AI: one confirm resolves the round; the view never exposes pending data', () => {
  const s = K.createSession('ai'); K.submitChoice(s, WHITE); const v = K.getPublicView(s); eq(v.phase, 'reveal'); eq(v.lastRound.choices.length, 2); deq(v.lastRound.choices[0], WHITE); N.rules.validateChoice(v.lastRound.choices[1]);
});
t('phase guards and invalid choices are rejected', () => {
  const s = K.createSession('hvh'); throwsCode(() => K.proceedFromHandoff(s), 'BAD_PHASE'); throwsCode(() => K.nextRound(s), 'BAD_PHASE'); throwsCode(() => K.submitChoice(s, C(1, 'CUT', '1-5')), 'INVALID_EDGE');
  K.submitChoice(s, WHITE); throwsCode(() => K.submitChoice(s, BLACK), 'BAD_PHASE');
});
t('undo: unavailable at start and during hidden entry; restores the previous state exactly', () => {
  const s = K.createSession('hvh'); eq(K.canUndo(s), false); K.submitChoice(s, WHITE); eq(K.canUndo(s), false); K.proceedFromHandoff(s); K.submitChoice(s, BLACK);
  eq(K.canUndo(s), true); eq(K.undo(s), true); deq(s.state, S.createInitialState()); eq(s.phase, 'pick'); eq(s.turn, 0); eq(K.undo(s), false);
});
t('undo works after the game is over', () => {
  const s = K.createSession('hvh'); const noop = [C(1, 'CREATE', '1-2'), C(5, 'CREATE', '5-6')];
  for (let i = 0; i < 2; i++) { K.submitChoice(s, noop[0]); K.proceedFromHandoff(s); K.submitChoice(s, noop[1]); if (i === 0) K.nextRound(s); }
  eq(s.phase, 'over'); eq(K.getPublicView(s).result.code, 'THREEFOLD_REPETITION'); K.undo(s); eq(s.phase, 'pick'); eq(s.state.result, null); eq(s.state.rounds.length, 1);
});
t('export contains only completed rounds (no hidden pending choice)', () => {
  const s = K.createSession('hvh'); K.submitChoice(s, C(6, 'CUT', '5-6')); const j = JSON.parse(St.exportHistory(s)); eq(j.rounds.length, 0); ok(!JSON.stringify(j).includes('5-6') || j.final.edges.includes('5-6'));
});
t('export -> import round-trip reproduces the identical state, including the result', () => {
  const s = K.createSession('ai'); for (let i = 0; i < 3 && !s.state.result; i++) { K.submitChoice(s, C(2, 'CREATE', '2-7')); if (s.phase === 'reveal') K.nextRound(s); }
  const r = St.importHistory(St.exportHistory(s)); ok(r.ok); deq(r.session.state, s.state); eq(r.session.mode, 'ai');
});
t('import rejects invalid data without throwing and without touching the current session', () => {
  const base = K.createSession('hvh'); K.submitChoice(base, WHITE); K.proceedFromHandoff(base); K.submitChoice(base, BLACK); const snap = JSON.stringify(base), good = JSON.parse(St.exportHistory(base));
  const mut = f => { const d = JSON.parse(JSON.stringify(good)); f(d); return JSON.stringify(d); };
  const cases = { 'not json': '{{', 'empty': '', 'too big': ' '.repeat(400000), 'wrong schema': mut(d => { d.schema = 2; }), 'wrong game': mut(d => { d.game = 'X'; }), 'bad mode': mut(d => { d.mode = 'online'; }),
    'unknown edge': mut(d => { d.rounds[0].choices[0].edge = '1-5'; }), 'bad node': mut(d => { d.rounds[0].choices[1].node = 11; }), 'bad action': mut(d => { d.rounds[0].choices[0].action = 'cut'; }),
    'one choice': mut(d => { d.rounds[0].choices.pop(); }), 'rounds not array': mut(d => { d.rounds = 5; }), 'tampered edges': mut(d => { d.final.edges.pop(); }), 'tampered streak': mut(d => { d.final.streak = [1, 0]; }),
    'tampered result': mut(d => { d.final.result = { type: 'draw', winner: null, code: 'THREEFOLD_REPETITION' }; }),
    'rounds after the end': mut(d => { const n = { choices: [C(1, 'CREATE', '1-2'), C(5, 'CREATE', '5-6')] }; d.rounds = [n, n, n]; delete d.final; }) };
  Object.keys(cases).forEach(k => { const r = St.importHistory(cases[k]); eq(r.ok, false, k); ok(r.code, k); }); ok(St.importHistory(JSON.stringify(good)).ok); eq(JSON.stringify(base), snap);
});
t('localStorage save/load works, and failing storage never throws', () => {
  const m = mem(), s = K.createSession('hvh'); K.submitChoice(s, WHITE); K.proceedFromHandoff(s); K.submitChoice(s, BLACK);
  ok(St.saveSession(s, m).ok); const r = St.loadSession(m); ok(r.ok); deq(r.session.state, s.state); eq(St.loadSession(mem()).code, 'EMPTY');
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }; eq(St.saveSession(s, bad).ok, false); eq(St.loadSession(bad).code, 'STORAGE');
});
t('V0.2.1 account/profile screen is linked and Windows launcher exists', () => {
  if (!env.fs) return 'SKIP';
  const html = env.fs.readFileSync(env.path.join(env.root, 'index.html'), 'utf8');
  const ui = env.fs.readFileSync(env.path.join(env.root, 'src', 'ui.js'), 'utf8');
  const account = env.fs.readFileSync(env.path.join(env.root, 'src', 'account-ui.js'), 'utf8');
  ok(html.includes('id=\"navProfile\"'), 'profile navigation button');
  ok(html.includes('id=\"screenProfile\"'), 'profile screen root');
  ok(html.includes('src/account-ui.js'), 'account UI script included');
  ok(ui.includes("'profile'") && ui.includes("$('#navProfile').onclick"), 'profile screen is navigable');
  ok(account.includes('/api/register') && account.includes('/api/login') && account.includes('/api/profile'), 'account UI calls the API');
  ok(env.fs.existsSync(env.path.join(env.root, 'START_NORI_WINDOWS.bat')), 'Windows launch helper');
});
t('index.html has no hardcoded UI text; every data-i18n key exists; every button id has a handler in ui.js', () => {
  if (!env.fs) return 'SKIP'; const html = env.fs.readFileSync(env.path.join(env.root, 'index.html'), 'utf8'), ui = env.fs.readFileSync(env.path.join(env.root, 'src', 'ui.js'), 'utf8');
  const keys = [...html.matchAll(/data-i18n="(\w+)"/g)].map(m => m[1]); ok(keys.length >= 10, 'few keys'); keys.forEach(k => ok(env.I18N.LANGS.en.s[k] !== undefined, 'missing key ' + k));
  [...html.matchAll(/<(button|option|span|h1|h2|label|a)\b[^>]*data-i18n[^>]*>([^<]+)</g)].forEach(m => ok(m[2].trim() === '', 'hardcoded text: ' + m[2]));
  [...html.matchAll(/<button[^>]*\bid="(\w+)"/g)].forEach(m => ok(new RegExp("\\$\\('#" + m[1] + "'\\)\\.onclick\\s*=").test(ui), 'no handler for #' + m[1]));
});
t('V0.1.1 appearance selector, sound preview, local fonts fallback, and light/dark tokens are present', () => {
  if (!env.fs) return 'SKIP';
  const html = env.fs.readFileSync(env.path.join(env.root, 'index.html'), 'utf8');
  const css = env.fs.readFileSync(env.path.join(env.root, 'styles.css'), 'utf8');
  const ui = env.fs.readFileSync(env.path.join(env.root, 'src', 'ui.js'), 'utf8');
  ok(html.includes('id="themeMode"') && html.includes('id="soundPreview"'), 'settings controls');
  ok(/\$\('#themeMode'\)\.onchange\s*=/.test(ui) && /\$\('#soundPreview'\)\.onchange\s*=/.test(ui), 'settings event handlers');
  ok(css.includes(':root[data-theme="light"]') && css.includes('--display:'), 'light tokens and display font');
  ok(html.includes('fonts.googleapis.com') && css.includes('system-ui'), 'web font and offline fallback');
  const names = Object.values(N.sound.SOUNDS);
  names.forEach(name => ok(env.fs.existsSync(env.path.join(env.root, 'assets', 'sounds', name)), 'missing sound asset: ' + name));
});
t('PWA files: manifest is valid, every icon exists with the declared PNG size, index.html links them, zoom is not disabled', () => {
  if (!env.fs) return 'SKIP'; const rd = f => env.fs.readFileSync(env.path.join(env.root, f)), m = JSON.parse(rd('manifest.webmanifest').toString('utf8')), html = rd('index.html').toString('utf8');
  ok(m.name && m.short_name && m.start_url && m.display === 'standalone' && m.theme_color && m.background_color, 'manifest fields'); ok(m.icons.length >= 3 && m.icons.some(i => i.purpose === 'maskable') && m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512'), 'icon set');
  m.icons.forEach(i => { const b = rd(i.src); ok(b.slice(1, 4).toString() === 'PNG', i.src + ' is not a PNG'); const [w, h] = i.sizes.split('x').map(Number); eq(b.readUInt32BE(16), w, i.src + ' width'); eq(b.readUInt32BE(20), h, i.src + ' height'); });
  ok(rd('icons/apple-touch-icon.png').readUInt32BE(16) === 180, 'apple-touch-icon 180px'); ok(rd('icons/icon.svg').toString().includes('<svg'), 'svg icon');
  ok(html.includes('rel="manifest"') && html.includes('apple-touch-icon') && html.includes('viewport-fit=cover') && html.includes('theme-color'), 'head links'); ok(!/user-scalable|maximum-scale/.test(html), 'zoom must stay enabled');
  const css = rd('styles.css').toString('utf8'); ok(css.includes('safe-area-inset-top') && css.includes('safe-area-inset-bottom') && css.includes('prefers-reduced-motion'), 'safe-area / reduced motion in CSS');
});
// i18n.js (UI strings) and tasks-data.js (task texts) are the two content files that may contain non-Latin text
t('no hardcoded non-Latin UI text outside i18n.js (Cyrillic, CJK, Hangul, Arabic)', () => {
  if (!env.fs) return 'SKIP'; const files = ['index.html', 'styles.css'].concat(env.fs.readdirSync(env.path.join(env.root, 'src')).filter(f => f !== 'i18n.js' && f !== 'tasks-data.js').map(f => 'src/' + f));
  files.forEach(f => { const s = env.fs.readFileSync(env.path.join(env.root, f), 'utf8'); ok(!/[\u0400-\u04FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\u0600-\u06FF]/.test(s), 'non-Latin text in ' + f); });
});
return results;
});
