// Tasks screen. All answers are verified by NORI.tasks (the real engine); this file only draws and collects input.
(function () {
'use strict';
const N = NORI, U = N.ui, T = N.tasks, D = N.tasksData, el = U.el, t = (k, p) => I18N.t(k, p), C = N.C, fe = U.fe;
let store = null; try { store = window.localStorage; } catch (e) { store = null; }
let prog = { solved: {}, attempts: {} }, cur = null, S = null, pane = 'tasks', botSearch = '', botFilter = 'all', selectedBotId = 'bot-spark', botLoadFailed = false;
const root = () => document.getElementById('screenTasks'), byId = id => D.find(x => x.id === id), txt = task => T.textOf(task, I18N.current());
const posOf = task => task.position || task.start || { edges: 'ring' }, catKey = c => 'cat' + c[0].toUpperCase() + c.slice(1), save = () => { if (store) T.saveProgress(store, prog); };
const fresh = task => ({ pick: { node: null, action: null, edge: null }, sel: new Set(), fb: null, sol: false, ch: task.kind === 'challenge' ? T.challengeStart(task) : null, last: null });
function viewFor(task, state) {
  const st = state || T.makeState(posOf(task)), rounds = st.rounds || [];
  return { phase: 'task', edges: st.edges, streak: st.streak, beacons: [0, 1].map(p => N.rules.getBeaconStatus(st.edges, p)), rounds, lastRound: rounds.length ? rounds[rounds.length - 1] : null, result: null };
}
const lineOf = (i, c) => `${U.pname(i)} → ${c.action === 'CREATE' ? '＋' : '✕'} ${U.aname(c.action)} · ${t('target')} ${fe(c.edge)} · ${t('node')} ${c.node}`;
function open(id) { cur = id; S = fresh(byId(id)); U.SND.play('click'); render(); window.scrollTo(0, 0); }
function back() { cur = null; S = null; render(); }
function solved(task, msg) { prog.solved[task.id] = true; save(); S.fb = { ok: true, extra: msg || '' }; U.SND.play('beacon'); }
function failed(extra) { S.fb = { ok: false, extra: extra || '' }; U.SND.play('error'); }
const attempt = task => { prog.attempts[task.id] = (prog.attempts[task.id] || 0) + 1; save(); };

function coinTaskState() {
  const day = new Date().toISOString().slice(0,10); let v = {};
  try { v = JSON.parse(localStorage.getItem('nori.coinTasks.v1') || '{}') || {}; } catch (_) {}
  if (v.day !== day) v = { day, claims: {}, coins: Number(v.coins) || 0 };
  return v;
}
function saveCoinTaskState(v) { try { localStorage.setItem('nori.coinTasks.v1', JSON.stringify(v)); } catch (_) {} }
function renderCoinTasks() {
  const r = root(); r.replaceChildren(); renderTabs(r);
  const state = coinTaskState(), solvedCount = D.filter(x => prog.solved[x.id]).length;
  const defs = [
    { id:'one', title:t('tk_coinTitle1'), desc:t('tk_coinDesc1'), progress:Math.min(1, solvedCount), goal:1, reward:10 },
    { id:'three', title:t('tk_coinTitle3'), desc:t('tk_coinDesc3'), progress:Math.min(3, solvedCount), goal:3, reward:25 },
    { id:'challenge', title:t('tk_coinTitleCh'), desc:t('tk_coinDescCh'), progress:D.filter(x=>x.kind==='challenge' && prog.solved[x.id]).length ? 1 : 0, goal:1, reward:20 }
  ];
  r.append(el('h2',{},t('tk_coinsHead')),el('p',{class:'tmeta'},t('tk_coinsIntro')),el('p',{class:'bot-detail-rating'},t('tk_coinsBalance',{n:state.coins})));
  const grid=el('div',{class:'taskgrid'});
  defs.forEach(d=>{const claimed=!!state.claims[d.id], done=d.progress>=d.goal; grid.append(el('article',{class:'taskcard'+(claimed?' done':'')},[el('span',{class:'tt'},d.title),el('p',{class:'tmeta'},d.desc),el('p',{class:'ts'},t('tk_progress',{p:d.progress,g:d.goal})+' · 🪙 '+d.reward),el('button',{class:'primary',disabled:!done||claimed,onclick:()=>{const latest=coinTaskState();if(latest.claims[d.id])return;latest.claims[d.id]=true;latest.coins=(Number(latest.coins)||0)+d.reward;saveCoinTaskState(latest);U.SND.play('beacon');render();}},claimed?t('tk_claimed'):done?t('tk_claim'):t('tk_keepGoing'))]));});
  r.append(grid,el('button',{class:'ghost',onclick:()=>{pane='tasks';render();}},t('tk_backToTasks')));
}
function renderTabs(r) {
  r.append(el('div', { class: 'tasks-subnav', role: 'tablist', 'aria-label': t('tk_sectionAria') }, [
    el('button', { class: 'tasks-subtab' + (pane === 'tasks' ? ' on' : ''), role: 'tab', 'aria-selected': String(pane === 'tasks'), onclick: () => { pane = 'tasks'; cur = null; S = null; render(); } }, t('tk_tabLearn')),
    el('button', { class: 'tasks-subtab' + (pane === 'bots' ? ' on' : ''), role: 'tab', 'aria-selected': String(pane === 'bots'), onclick: () => { pane = 'bots'; cur = null; S = null; render(); N.bots.load().then(() => render()).catch(() => { botLoadFailed = true; render(); }); } }, t('tk_tabBots')),
    el('button', { class: 'tasks-subtab' + (pane === 'coins' ? ' on' : ''), role: 'tab', 'aria-selected': String(pane === 'coins'), onclick: () => { pane = 'coins'; cur = null; S = null; render(); } }, t('tk_tabCoins'))
  ]));
}
function renderList() {
  const r = root(), done = D.filter(x => prog.solved[x.id]).length; r.replaceChildren();
  renderTabs(r);
  r.append(el('h2', {}, t('navTasks')), el('p', { class: 'tmeta' }, t('tasksIntro')), el('p', { class: 'tmeta', role: 'status' }, t('tasksProgress', { a: done, b: D.length })));
  if (!['en', 'ru'].includes(I18N.current())) r.append(el('p', { class: 'tmeta' }, t('taskLangNote')));
  r.append(el('button', { class: 'ghost', onclick: () => { if (window.confirm(t('confirmResetTasks'))) { prog = { solved: {}, attempts: {} }; save(); render(); } } }, t('tasksResetAll')));
  T.CATEGORIES.forEach(c => {
    r.append(el('h2', {}, t(catKey(c))), el('div', { class: 'taskgrid' }, D.filter(x => x.category === c).map(task => el('button', { class: 'taskcard' + (prog.solved[task.id] ? ' done' : ''), onclick: () => open(task.id) }, [el('span', { class: 'tt' }, txt(task).title), el('span', { class: 'ts' }, prog.solved[task.id] ? '✓ ' + t('taskSolved') : ' ')]))));
  });
}
function playBot(bot) {
  if (!bot) return;
  try { localStorage.setItem('nori.selectedBot.v1', JSON.stringify({ id: bot.id, name: bot.name, rating: bot.rating, monologue: bot.monologue, icon: bot.icon, coins: bot.coins, style: bot.style, avgWeight: bot.avgWeight, risk: bot.risk })); } catch (_) {}
  const mode = document.getElementById('mode'); if (mode) mode.value = 'ai';
  const playTab = document.getElementById('navPlay'); if (playTab) playTab.click();
  const newBtn = document.getElementById('new'); if (newBtn) newBtn.click();
}
function renderBots() {
  const r = root(); r.replaceChildren(); renderTabs(r);
  r.append(el('div', { class: 'bot-catalog-header' }, [el('div', {}, [el('h2', {}, t('tk_catalogTitle')), el('p', { class: 'tmeta' }, t('tk_catalogIntro'))]), el('span', { class: 'status-pill' }, '20 AI') ]));
  if (!N.bots.loaded) {
    r.append(el('p', { class: 'account-note', role: 'status' }, botLoadFailed ? t('tk_catalogFail') : t('tk_catalogLoading')));
    if (!botLoadFailed) N.bots.load().then(() => render()).catch(() => { botLoadFailed = true; render(); });
    return;
  }
  const all = N.bots.list();
  if (!all.some(b => b.id === selectedBotId)) selectedBotId = all[0] && all[0].id;
  const tools = el('div', { class: 'bot-catalog-tools' });
  const search = el('input', { type: 'search', class: 'bot-search', placeholder: t('tk_searchPh'), value: botSearch, 'aria-label': t('tk_searchAria') });
  search.oninput = () => { botSearch = search.value; render(); const next = root().querySelector('.bot-search'); if (next) { next.focus(); next.setSelectionRange(botSearch.length, botSearch.length); } };
  tools.append(search, el('div', { class: 'bot-filters' }, [
    ['all', 'tk_fAll'], ['easy', 'tk_fEasy'], ['medium', 'tk_fMedium'], ['strong', 'tk_fStrong'], ['elite', 'tk_fElite']
  ].map(([id,label]) => el('button', { class: 'chip' + (botFilter === id ? ' on' : ''), 'aria-pressed': String(botFilter === id), onclick: () => { botFilter = id; render(); } }, t(label)))));
  r.append(tools);
  const matches = all.filter(b => {
    const q = botSearch.trim().toLocaleLowerCase();
    const searchOk = !q || [b.name,b.style,b.bio,b.monologue].some(x => String(x).toLocaleLowerCase().includes(q));
    const filterOk = botFilter === 'all' || (botFilter === 'easy' && b.rating < 700) || (botFilter === 'medium' && b.rating >= 700 && b.rating < 1500) || (botFilter === 'strong' && b.rating >= 1500 && b.rating < 2400) || (botFilter === 'elite' && b.rating >= 2400);
    return searchOk && filterOk;
  });
  const grid = el('div', { class: 'bot-catalog-layout' });
  const cards = el('div', { class: 'bot-grid bot-grid-tasks' });
  matches.forEach(bot => {
    const selected = bot.id === selectedBotId;
    const card = el('article', { class: 'bot-card bot-card-premium ' + (selected ? 'selected' : '') }, [
      el('div', { class: 'bot-portrait accent-' + bot.accent, 'aria-hidden': 'true' }, [el('span', { class: 'bot-portrait-glyph' }, bot.icon), el('span', { class: 'bot-portrait-index' }, String(bot.number).padStart(2,'0'))]),
      el('div', { class: 'bot-card-title-row' }, [el('h3', {}, bot.name), el('span', { class: 'bot-rating' }, String(bot.rating))]),
      el('span', { class: 'bot-style style-' + bot.style }, bot.tier + ' · ' + (I18N.LANGS.en.s['tk_st_' + bot.style] ? t('tk_st_' + bot.style) : bot.style)),
      el('p', { class: 'bot-short-quote' }, '«' + bot.monologue + '»'),
      el('div', { class: 'bot-meta' }, [el('span', {}, t('tk_coinsPlus', { n: bot.coins })), el('span', {}, t('tk_ratingN', { n: bot.rating }))]),
      el('button', { class: selected ? 'ghost bot-select' : 'primary bot-select', onclick: () => { selectedBotId = bot.id; render(); } }, selected ? t('tk_selected') : t('tk_select'))
    ]);
    cards.append(card);
  });
  if (!matches.length) cards.append(el('p', { class: 'empty-state' }, t('tk_empty')));
  grid.append(cards);
  const picked = all.find(b => b.id === selectedBotId);
  if (picked) grid.append(el('aside', { class: 'bot-detail-panel' }, [
    el('div', { class: 'bot-portrait bot-portrait-large accent-' + picked.accent, 'aria-hidden': 'true' }, [el('span', { class: 'bot-portrait-glyph' }, picked.icon), el('span', { class: 'bot-portrait-index' }, String(picked.number).padStart(2,'0'))]),
    el('p', { class: 'bot-detail-kicker' }, t('tk_kicker')),
    el('h2', {}, picked.name), el('p', { class: 'bot-detail-rating' }, '♙ ' + picked.rating + ' · ' + picked.tier),
    el('p', { class: 'bot-detail-bio' }, picked.bio),
    el('h3', {}, t('tk_monologue')),
    el('blockquote', { class: 'bot-monologue-large' }, picked.monologue),
    el('div', { class: 'bot-reward' }, [el('span', {}, t('tk_reward')), el('strong', {}, t('tk_coinsN', { n: picked.coins }))]),
    el('p', { class: 'account-help' }, t('tk_rewardNote')),
    el('button', { class: 'primary bot-start-button', onclick: () => playBot(picked) }, t('tk_play', { name: picked.name }))
  ]));
  r.append(grid);
}
function solutionLines(task) {
  if (task.kind === 'action') {
    const g = {}; T.acceptedClasses(task).forEach(k => { const [e, a, c] = k.split('|'); (g[e + '|' + a] = g[e + '|' + a] || new Set()).add(c); });
    return Object.keys(g).map(k => { const [e, a] = k.split('|'), cs = g[k]; return `${a === 'CREATE' ? '＋' : '✕'} ${U.aname(a)} ${fe(e)} (${cs.has('C') && cs.has('U') ? t('taskAny') : t('taskCommittedOnly')})`; });
  }
  if (task.kind === 'commit') return T.committedItems(task).map(i => `${t('node')} ${task.items[i].node} → ${t('target')} ${fe(task.items[i].edge)}`);
  if (task.kind === 'resolve') return [t(T.resolvedExists(task) ? 'taskYes' : 'taskNo')];
  if (task.kind === 'bridges') return T.bridgeSet(task).map(fe);
  return task.reference.map((c, i) => `${t('round', { n: i + 1 })}: ${c.action === 'CREATE' ? '＋' : '✕'} ${U.aname(c.action)} ${fe(c.edge)} (${t('node')} ${c.node})`);
}
function feedback(task, p) {
  p.append(el('div', { class: 'fb ' + (S.fb ? (S.fb.ok ? 'ok' : 'no') : ''), role: 'status', hidden: !S.fb }, S.fb ? [el('h3', {}, t(S.fb.ok ? 'taskCorrect' : 'taskWrong')), S.fb.extra ? el('p', {}, S.fb.extra) : null, S.fb.ok ? el('p', {}, txt(task).explain) : null, S.fb.counter ? el('p', {}, [t('taskCounter') + ' ', el('strong', {}, lineOf(task.me === 0 ? 1 : 0, S.fb.counter))]) : null] : []));
  const acts = [];
  if (S.fb && S.fb.ok) { const i = D.indexOf(task); acts.push(el('button', { class: 'primary', onclick: () => (i + 1 < D.length ? open(D[i + 1].id) : back()) }, t(i + 1 < D.length ? 'taskNext' : 'taskBack'))); }
  acts.push(el('button', { onclick: () => { S.sol = !S.sol; render(); } }, t('taskShowSolution')));
  p.append(el('div', { class: 'actions' }, acts));
  if (S.sol) p.append(el('div', { class: 'fb' }, [el('h3', {}, t('taskSolutionTitle')), el('ul', { class: 'sol' }, solutionLines(task).map(l => el('li', {}, l)))]));
}
function pickPanel(task, p, onGo) {   // node / action / link choice, same controls as in a game
  const pk = S.pick, st = T.makeState(posOf(task)), active = new Set(S.ch ? S.ch.edges : st.edges), setP = (k, v) => { pk[k] = pk[k] === v ? null : v; U.SND.play(k === 'action' ? (v === 'CREATE' ? 'create' : 'cut') : 'click'); S.fb = null; render(); };
  S.setP = setP;
  p.append(el('div', { class: 'hint' }, t('stepNode')), U.chips(C.NODES.map(n => ({ id: n, label: String(n) })), pk.node, x => setP('node', x)));
  p.append(el('div', { class: 'hint' }, t('stepAction')), U.chips([{ id: 'CREATE', label: '＋ ' + t('create') }, { id: 'CUT', label: '✕ ' + t('cut') }], pk.action, x => setP('action', x)));
  p.append(el('div', { class: 'hint' }, `${t('stepEdge')} — ${t('edgeHint')}`), U.chips(C.EDGES.map(k => ({ id: k, label: fe(k), off: !active.has(k) })), pk.edge, x => setP('edge', x)));
  p.append(el('div', { class: 'actions' }, [el('button', { class: 'primary', 'data-snd': '1', disabled: !(pk.node && pk.action && pk.edge), onclick: onGo }, t('taskCheck'))]));
}
function renderTask() {
  const task = byId(cur), r = root(), x = txt(task); r.replaceChildren(); renderTabs(r);
  const svg = el('svg', { id: 'taskBoard', viewBox: '0 0 520 520', role: 'group' }, [], true), panel = el('div', { id: 'taskPanel' });
  r.append(el('button', { class: 'ghost', onclick: back }, '← ' + t('taskBack')), el('h2', {}, x.title), el('p', {}, x.desc), el('p', { class: 'tmeta' }, t('onlineYouAre', { p: U.pname(task.me) })));
  const left = el('div', {}, [el('div', { class: 'boardwrap', dir: 'ltr' }, [svg])]), view = el('div', { class: 'taskview' }, [left, panel]); r.append(view);
  const opts = { svg, picking: false, pick: S.pick };
  if (task.kind === 'action') { Object.assign(opts, { picking: true, onNode: i => S.setP('node', i), onEdge: k => S.setP('edge', k) }); }
  if (task.kind === 'challenge') { const ongoing = T.challengeStatus(task, S.ch) === 'ongoing'; Object.assign(opts, { picking: ongoing, onNode: i => S.setP('node', i), onEdge: k => S.setP('edge', k) }); }
  if (task.kind === 'bridges') Object.assign(opts, { picking: true, selectedEdges: S.sel, onNode: () => {}, onEdge: k => { S.sel.has(k) ? S.sel.delete(k) : S.sel.add(k); U.SND.play('click'); S.fb = null; render(); } });
  if (task.kind === 'commit') panel.append(el('p', { class: 'hint' }, t('taskSelectHint')), el('div', { class: 'itemlist' }, task.items.map((it, i) => el('button', { 'aria-pressed': String(S.sel.has(i)), 'data-snd': '1', onclick: () => { S.sel.has(i) ? S.sel.delete(i) : S.sel.add(i); U.SND.play('click'); S.fb = null; render(); } }, `${t('node')} ${it.node} → ${t('target')} ${fe(it.edge)}`))),
    el('div', { class: 'actions' }, [el('button', { class: 'primary', onclick: () => { attempt(task); T.sameSet([...S.sel], T.committedItems(task)) ? solved(task) : failed(); render(); } }, t('taskCheck'))]));
  if (task.kind === 'resolve') panel.append(...task.choices.map((c, i) => el('p', { class: 'ln' }, lineOf(i, c))), el('p', {}, el('strong', {}, t('taskExistsQ', { e: fe(task.question.edge) }))),
    el('div', { class: 'actions' }, [true, false].map(v => el('button', { onclick: () => { attempt(task); T.resolvedExists(task) === v ? solved(task) : failed(); render(); } }, t(v ? 'taskYes' : 'taskNo')))));
  if (task.kind === 'bridges') panel.append(el('p', { class: 'hint' }, t('taskSelectHint')), el('div', { class: 'chips' }, makeEdges(task).map(k => el('button', { class: 'chip' + (S.sel.has(k) ? ' on' : ''), 'aria-pressed': String(S.sel.has(k)), 'data-snd': '1', onclick: () => { S.sel.has(k) ? S.sel.delete(k) : S.sel.add(k); U.SND.play('click'); S.fb = null; render(); } }, fe(k)))),
    el('div', { class: 'actions' }, [el('button', { class: 'primary', onclick: () => { attempt(task); T.sameSet([...S.sel], T.bridgeSet(task)) ? solved(task) : failed(); render(); } }, t('taskCheck'))]));
  if (task.kind === 'action') pickPanel(task, panel, () => {
    attempt(task); const res = T.checkAction(task, { node: S.pick.node, action: S.pick.action, edge: S.pick.edge }); if (res.ok) solved(task); else { failed(); S.fb.counter = res.counter; } render();
  });
  if (task.kind === 'challenge') {
    const status = T.challengeStatus(task, S.ch), n = S.ch.rounds.length;
    panel.append(el('p', { class: 'tmeta' }, t('taskRound', { n: Math.min(n + 1, task.limit), m: task.limit })), ...S.ch.rounds.map(rec => el('p', { class: 'ln' }, `${t('round', { n: rec.round })}: ${rec.choices.map((c, i) => lineOf(i, c)).join(' | ')}`)));
    if (status === 'ongoing') pickPanel(task, panel, () => {
      S.ch = T.challengeStep(task, S.ch, { node: S.pick.node, action: S.pick.action, edge: S.pick.edge }); S.pick = { node: null, action: null, edge: null }; const st = T.challengeStatus(task, S.ch);
      if (st === 'won') { attempt(task); solved(task, t('taskChallengeWon', { n: S.ch.rounds.length })); U.SND.play('win'); } else if (st === 'failed') { attempt(task); failed(t('taskChallengeLost')); U.SND.play('lose'); } else U.SND.play('reveal'); render();
    });
    panel.append(el('div', { class: 'actions' }, [el('button', { class: 'ghost', onclick: () => { S = fresh(task); render(); } }, t('taskReset'))]));
  }
  U.renderBoard(viewFor(task, task.kind === 'challenge' ? S.ch : null), opts); feedback(task, panel);
}
const makeEdges = task => T.makeState(task.position).edges;
function render() { if (!root()) return; prog = prog.solved ? prog : { solved: {}, attempts: {} }; if (pane === 'bots' && !cur) renderBots(); else if (pane === 'coins' && !cur) renderCoinTasks(); else if (cur && byId(cur)) renderTask(); else renderList(); }
N.ui.screens.tasks = { show() { prog = store ? T.loadProgress(store) : prog; if (pane === 'bots') N.bots.load().then(() => render()).catch(() => { botLoadFailed = true; render(); }); }, render };
})();
