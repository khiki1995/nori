// DOM layer only. All rules live in NORI.*; all text comes from I18N.t(). The UI reads game data only through NORI.controller.getPublicView()
// (local) or NORI.online.makeView() (online, built from authoritative server snapshots).
(function () {
'use strict';
const N = NORI, I = I18N, t = I.t, K = N.controller, St = N.storage, C = N.C, $ = s => document.querySelector(s), NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, kids, svg) => {
  const e = svg ? document.createElementNS(NS, tag) : document.createElement(tag);
  for (const k in attrs || {}) { const v = attrs[k]; if (k.startsWith('on')) e[k] = v; else if (v === false || v === null || v === undefined) continue; else e.setAttribute(k, v === true ? '' : v); }
  [].concat(kids === undefined ? [] : kids).filter(c => c !== null && c !== undefined && c !== false).forEach(c => e.append(c));
  return e;
};
const fe = k => k.replace('-', '–');
const OWNER = { 1: 'w', 4: 'w', 7: 'w', 6: 'b', 9: 'b', 2: 'b' };
const pos = i => { const a = (-90 + (i - 1) * 36) * Math.PI / 180; return { x: 260 + 205 * Math.cos(a), y: 260 + 205 * Math.sin(a) }; };
const pname = i => t(i ? 'black' : 'white'), aname = a => t(a === 'CREATE' ? 'create' : 'cut');
const lerp = (k, f) => { const [a, c] = N.graph.edgeEnds(k), A = pos(a), D = pos(c); return { x: A.x + (D.x - A.x) * f, y: A.y + (D.y - A.y) * f }; };
const NOPICK = () => ({ node: null, action: null, edge: null });
let curScreen = 'play', session, store = null, saveState = '', notice = '', pick = NOPICK(), copyMsg = '', tourStep = 0, lastNetErr = null, archivedSession = null;
try { store = window.localStorage; } catch (e) { store = null; }
// UI preferences (motion, intro) and sound settings live in localStorage and survive reloads without touching the game save.
const loadUi = () => { try { return Object.assign({ motion: 'on', tour: 'new', theme: 'dark', soundPreview: 'edgeCreated' }, JSON.parse(store.getItem('nori.ui.v1') || '{}')); } catch (e) { return { motion: 'on', tour: 'new', theme: 'dark', soundPreview: 'edgeCreated' }; } };
let ui = loadUi(); const saveUi = () => { try { if (store) store.setItem('nori.ui.v1', JSON.stringify(ui)); } catch (e) { /* ignore */ } };
const applyMotion = () => { document.documentElement.dataset.motion = ui.motion === 'off' ? 'off' : 'on'; };
function applyTheme() {
  const requested = ['dark', 'light', 'system'].includes(ui.theme) ? ui.theme : 'dark';
  const isLight = requested === 'light' || (requested === 'system' && !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches));
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isLight ? '#F4F7FB' : '#0A0D13');
  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute('content', isLight ? 'light' : 'dark');
}
const systemThemeQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
if (systemThemeQuery) {
  const updateSystemTheme = () => { if (ui.theme === 'system') applyTheme(); };
  if (systemThemeQuery.addEventListener) systemThemeQuery.addEventListener('change', updateSystemTheme);
  else if (systemThemeQuery.addListener) systemThemeQuery.addListener(updateSystemTheme);
}
const SND = N.sound.createSound({ storage: store, Audio: window.Audio, assetBase: 'assets/sounds/' }), FB = N.sound.createFeedback(SND);
// Online client: the server snapshot is the only source of truth while a room is active; local modes stay untouched underneath.
const O = N.online.createClient({ WebSocket: window.WebSocket, storage: store, location: window.location });
const onl = () => O.getModel(), curView = () => (onl().active ? O.makeView() : K.getPublicView(session));
const ERR = { ROOM_NOT_FOUND: 'errRoomGone', ROOM_FULL: 'errRoomFull', BAD_CODE: 'errCode', BAD_TOKEN: 'errToken', ROUND_MISMATCH: 'errRound', GAME_OVER: 'errGameOver', RATE_LIMITED: 'errRate', OPPONENT_MISSING: 'errOppMissing', DUPLICATE_CHOICE: 'errDuplicate', INVALID_CHOICE: 'errInvalid', ALREADY_IN_ROOM: 'errAlready', REPLACED: 'errReplaced', UNAVAILABLE: 'onlineNeedsServer', CONNECTION: 'onlineFailed' };
const errText = c => t(ERR[c] || 'errServer');

function save() { const r = store ? St.saveSession(session, store) : { ok: false }; saveState = r.ok ? 'saved' : 'storageOff'; renderSave(); }
function setSession(s, msg) { session = s; archivedSession = s && s.state && s.state.result ? s : null; pick = NOPICK(); FB.reset(); $('#mode').value = s.mode; notice = msg || ''; render(); save(); }
const unfinished = () => (session.state.rounds.length > 0 && !session.state.result) || session.phase === 'handoff';
function selectedBotProfile() { try { const b = JSON.parse(localStorage.getItem('nori.selectedBot.v1') || 'null'); return b && typeof b.id === 'string' ? b : null; } catch (_) { return null; } }
function newGame(mode) {
  if (unfinished() && !window.confirm(t('confirmNew'))) { $('#mode').value = session.mode; return; }
  const nextMode = mode || session.mode, bot = nextMode === 'ai' ? selectedBotProfile() : null;
  setSession(K.createSession(nextMode, bot && bot.id), bot ? `${bot.icon || '✦'} ${bot.name}: ${bot.monologue || ''}` : '');
}
function confirmPick() {
  if (!(pick.node && pick.action && pick.edge)) return;
  const c = { node: pick.node, action: pick.action, edge: pick.edge }; pick = NOPICK();
  if (onl().active) { O.submitChoice(c); render(); return; }   // online: ONE message out, every local trace cleared; the confirm tone waits for the server
  K.submitChoice(session, c); SND.play('confirm'); render(); if (session.phase === 'reveal' || session.phase === 'over') save();
}
const setPick = (k, v) => { pick[k] = pick[k] === v ? null : v; if (pick[k] !== null) SND.play(k === 'action' ? (v === 'CREATE' ? 'create' : 'cut') : 'click'); render(); };

// Event texts are built from structured engine events, so they translate on the fly.
function resText(e) { return !e.changed ? t('noChange') : t(e.action === 'CREATE' ? 'edgeCreated' : 'edgeCut'); }
function evText(e) {
  const ed = fe(e.edge);
  if (e.kind === 'apply') return t('evApply', { p: pname(e.player), a: aname(e.action), e: ed, r: resText(e) });
  if (e.kind === 'merged') return t('evMerged', { a: aname(e.action), e: ed, r: resText(e) });
  if (e.kind === 'override') return t('evOverride', { e: ed, p: pname(e.winner) });
  return t('evConflict', { c: t('conflict'), e: ed, why: t(e.committed[0] && e.committed[1] ? 'whyBoth' : 'whyNone') });
}
function choiceText(i, c, committed) { return `${pname(i)} → ${c.action === 'CREATE' ? '＋' : '✕'} ${aname(c.action)} · ${t('target')} ${fe(c.edge)} · ${t('node')} ${c.node} · ${committed ? '✓' : '✗'} ${t(committed ? 'committed' : 'notCommitted')}`; }
function resultText(r, v) {
  const why = r.code === 'SIGNAL_BREAK' ? t('reasonSignal', { p: pname(r.loser) }) : t(r.code === 'SIMULTANEOUS_SIGNAL_BREAK' ? 'reasonSimul' : 'reasonRep');
  const head = r.type === 'draw' ? t('draw') : v.mode === 'online' ? t(r.winner === v.turn ? 'win' : 'lose') : v.mode === 'ai' ? t(r.winner === 0 ? 'win' : 'lose') : t('wins', { p: pname(r.winner) });
  return `${head} — ${why}`;
}
const press = fn => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

function connText(v) {
  const o = v.online;
  if (o.status === 'connecting') return t('onlineConnecting');
  if (o.status === 'reconnecting') return t('onlineReconnecting', { n: o.attempts });
  if (o.status === 'failed') return t('onlineFailed');
  return !o.opponentPresent ? t('onlineWaitOpp') : o.opponentConnected ? t('onlineOppOn') : t('onlineOppOff');
}
// Always-visible status line above the board: whose move, waiting, round finished, connection problems.
function phaseInfo(v) {
  if (v.mode === 'online') {
    if (v.online.status === 'reconnecting') return { k: 'error', ic: '!', text: connText(v) };
    if (v.online.status === 'failed') return { k: 'error', ic: '!', text: connText(v) };
  }
  switch (v.phase) {
    case 'connecting': return { k: 'wait', ic: '…', text: t('onlineConnecting') };
    case 'lobby': return { k: 'wait', ic: '…', text: t('onlineWaitOpp') };
    case 'waiting': return { k: 'wait', ic: '…', text: t('onlineLocked') };
    case 'handoff': return { k: 'wait', ic: '…', text: t('waiting', { p: pname(1) }) };
    case 'pick': return { k: 'pick', ic: '▶', text: v.mode === 'online' ? `${t('round', { n: v.round })} · ${t('phasePick')}` : t('turn', { n: v.round, p: pname(v.turn) }) };
    case 'reveal': return { k: 'done', ic: '✓', text: t('roundDone') };
    default: return { k: 'done', ic: '★', text: v.result ? resultText(v.result, v) : t('roundDone') };
  }
}
function renderPhase(v) { const p = $('#phase'), i = phaseInfo(v); p.className = 'phase k-' + i.k; p.replaceChildren(el('span', { class: 'ic', 'aria-hidden': 'true' }, i.ic), el('span', {}, i.text)); }

function renderBoard(v, o) {   // o (optional) lets other screens reuse the board: {svg, picking, pick, selectedEdges, onNode, onEdge}
  o = o || {}; const b = o.svg || $('#board'); b.replaceChildren(); b.setAttribute('aria-label', t('board'));
  const picking = o.picking !== undefined ? o.picking : v.phase === 'pick', pk = o.pick || pick, selE = o.selectedEdges || null, onNode = o.onNode || (i => setPick('node', i)), onEdge = o.onEdge || (k => setPick('edge', k)), hid = 'hatch-' + (b.id || 'board'); b.setAttribute('class', picking ? 'pick' : '');
  b.insertAdjacentHTML('afterbegin', '<defs><pattern id="' + hid + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#1A1016"/><line x1="0" y1="0" x2="0" y2="7" stroke="#E0556C" stroke-width="2.5"/></pattern></defs>');
  const rv = v.lastRound, conflicts = rv ? rv.events.filter(e => e.kind === 'conflict').map(e => e.edge) : [], active = new Set(v.edges);
  C.EDGES.forEach(k => {
    const [a, c] = N.graph.edgeEnds(k), A = pos(a), D = pos(c);
    if (rv) [0, 1].forEach(i => { if (rv.choices[i].edge === k) b.append(el('line', { class: 'edge halo ' + (i ? 'bp' : 'wp'), x1: A.x, y1: A.y, x2: D.x, y2: D.y }, [], true)); });
    b.append(el('line', { class: 'edge ' + (active.has(k) ? 'on' : 'off') + ((picking && pk.edge === k) || (selE && selE.has(k)) ? ' sel' : '') + (conflicts.includes(k) ? ' cf' : ''), x1: A.x, y1: A.y, x2: D.x, y2: D.y }, [], true));
  });
  if (rv) rv.changes.forEach(ch => { const [a, c] = N.graph.edgeEnds(ch.edge), A = pos(a), D = pos(c); b.append(el('line', { class: 'edge chg', x1: A.x, y1: A.y, x2: D.x, y2: D.y }, [], true)); });   // accent on edges that really changed (settles after ~2s)
  if (picking) C.EDGES.forEach(k => { // every one of the 14 edges is clickable, active or not
    const [a, c] = N.graph.edgeEnds(k), A = pos(a), D = pos(c);
    b.append(el('line', { class: 'hit', x1: A.x, y1: A.y, x2: D.x, y2: D.y, tabindex: 0, role: 'button', 'aria-pressed': String(pk.edge === k || !!(selE && selE.has(k))), 'aria-label': `${t('target')} ${fe(k)} ${active.has(k) ? '●' : '○'}`, onclick: () => onEdge(k), onkeydown: press(() => onEdge(k)) }, [], true));
  });
  const status = {}; C.PLAYERS.forEach((P, i) => P.beacons.forEach((bn, j) => { status[bn] = v.beacons[i][j] ? 'ok' : 'cut'; }));
  const prevB = rv ? (v.rounds.length > 1 ? v.rounds[v.rounds.length - 2].beaconsAfter : [[true, true], [true, true]]) : null, changedBeacon = new Set();
  if (prevB) C.PLAYERS.forEach((P, i) => P.beacons.forEach((bn, j) => { if (v.beacons[i][j] !== prevB[i][j]) changedBeacon.add(bn); }));
  C.NODES.forEach(i => {
    const P = pos(i), o = OWNER[i] || 'n', isSrc = i === 1 || i === 6, st = status[i];
    const cls = 'node' + (st ? ' ' + st : '') + (picking && pk.node === i ? ' intent' : ''), fill = o === 'w' ? '#DDE3EC' : o === 'b' ? `url(#${hid})` : '#2A3342';
    const act = picking ? { tabindex: 0, role: 'button', 'aria-label': `${t('node')} ${i}`, 'aria-pressed': String(pk.node === i), onclick: () => onNode(i), onkeydown: press(() => onNode(i)) } : {};
    if (isSrc) b.append(el('circle', { class: 'ring', cx: P.x, cy: P.y, r: 35 }, [], true));
    if (changedBeacon.has(i)) b.append(el('circle', { class: 'ring bchg', cx: P.x, cy: P.y, r: 38 }, [], true));
    b.append(st ? el('rect', Object.assign({ class: cls, fill, x: P.x - 23, y: P.y - 23, width: 46, height: 46, rx: 8 }, act), [], true) : el('circle', Object.assign({ class: cls, fill, cx: P.x, cy: P.y, r: 25 }, act), [], true));
    b.append(el('text', { class: 'lbl ' + o, x: P.x, y: P.y }, String(i), true));
    if (st) b.append(el('circle', { class: 'bd ' + st, cx: P.x + 24, cy: P.y - 24, r: 11 }, [], true), el('text', { class: 'bdt', x: P.x + 24, y: P.y - 24 }, st === 'ok' ? '✓' : '✕', true));
  });
  if (rv) [0, 1].forEach(i => { // reveal badges: + create, x cut
    const c = rv.choices[i], p = lerp(c.edge, i ? 0.65 : 0.35);
    const shape = i ? el('rect', { x: p.x - 13, y: p.y - 13, width: 26, height: 26, rx: 5, fill: '#6F1F33', stroke: '#E0556C', 'stroke-width': 2.5 }, [], true) : el('circle', { cx: p.x, cy: p.y, r: 14, fill: '#1F4175', stroke: '#5A9CF0', 'stroke-width': 2.5 }, [], true);
    b.append(el('g', { class: 'badge', style: `transform-origin:${p.x}px ${p.y}px` }, [shape, el('text', { class: 'bdt', x: p.x, y: p.y, style: 'font-size:21px' }, c.action === 'CREATE' ? '+' : '×', true)], true));
  });
}
function renderCards(v) {
  const box = $('#cards'); box.replaceChildren(); const online = v.mode === 'online';
  C.PLAYERS.forEach((P, i) => {
    const me = online && i === v.turn;
    box.append(el('div', { class: 'card ' + P.key + (me ? ' me' : '') }, [
      el('div', { class: 'ch' }, [el('span', { class: 'pip', 'aria-hidden': 'true' }, i ? '▨' : '○'), el('b', {}, pname(i)), online ? el('span', { class: 'tagme' }, me ? t('you') : t('onlineOpponent')) : null]),
      el('p', {}, `◎ ${t('source')} ${P.source}`),
      ...P.beacons.map((bn, j) => el('p', {}, `◻ ${t('beacon')} ${bn}: ${v.beacons[i][j] ? '✓' : '✕'} ${t(v.beacons[i][j] ? 'connected' : 'severed')}`)),
      el('div', { class: 'streak', 'aria-hidden': 'true' }, Array.from({ length: C.STREAK_TARGET }, (_, n) => el('span', { class: 'dot' + (n < v.streak[i] ? ' f' : '') }))),
      el('p', {}, `${t('signalBreak')}: ${t('streak', { n: v.streak[i], m: C.STREAK_TARGET })}`),
      el('p', { class: 'done' }, v.phase === 'reveal' || v.phase === 'over' ? '' : v.hasPending[i] ? '✓ ' + t('chosen') : t('notChosen'))]));
  });
}
const chips = (items, cur, fn) => el('div', { class: 'chips' }, items.map(x => el('button', { class: 'chip' + (cur === x.id ? ' on' : '') + (x.off ? ' off' : ''), 'data-snd': '1', onclick: () => fn(x.id), 'aria-pressed': String(cur === x.id) }, x.label)));
// What is chosen and what is still missing, for the local player only. Order is a suggestion; simultaneity is untouched.
function renderSteps(p) {
  const labels = [t('stepNode'), t('stepAction'), t('stepEdge')].map(s => s.replace(/^\d+\.\s*/, '')).concat([t('confirm')]);
  const vals = [pick.node ? String(pick.node) : '', pick.action ? aname(pick.action) : '', pick.edge ? fe(pick.edge) : '', ''], done = [!!pick.node, !!pick.action, !!pick.edge, false];
  let cur = done.findIndex(d => !d); if (cur < 0) cur = 3;
  p.append(el('ol', { class: 'steps', 'aria-label': t('yourChoice') }, labels.map((lb, i) => el('li', { class: 'step ' + (done[i] ? 'done' : i === cur ? 'current' : 'todo'), 'aria-current': i === cur ? 'step' : null }, [el('span', { class: 'n', 'aria-hidden': 'true' }, done[i] ? '✓' : String(i + 1)), el('span', { class: 'lb' }, lb), el('span', { class: 'val' }, vals[i])]))));
  p.append(el('p', { class: 'stephint' }, t('hint' + (cur + 1))));
}
function renderPanel(v) {
  const p = $('#panel'); p.replaceChildren(); const active = new Set(v.edges);
  if (v.mode === 'online' && ['connecting', 'lobby', 'waiting'].includes(v.phase)) return renderOnlineWait(p, v);
  if (v.phase === 'handoff') {
    p.append(el('h2', {}, t('waiting', { p: pname(1) })), el('p', {}, t('handoffText', { a: pname(0), b: pname(1) })),
      el('button', { class: 'primary', onclick: () => { K.proceedFromHandoff(session); render(); } }, t('handoffBtn', { p: pname(1) })));
  } else if (v.phase === 'pick') {
    const P = C.PLAYERS[v.turn];
    p.append(el('h2', {}, t('turn', { n: v.round, p: pname(v.turn) }) + (v.mode === 'ai' ? ' ' + t('aiNote') : '')), el('p', { class: 'hint' }, t('roleHint', { p: pname(v.turn), b: P.beacons.join(' · '), s: P.source })));
    renderSteps(p);
    p.append(el('div', { class: 'hint' }, t('stepNode')), chips(C.NODES.map(n => ({ id: n, label: String(n) })), pick.node, x => setPick('node', x)));
    p.append(el('div', { class: 'hint' }, t('stepAction')), chips([{ id: 'CREATE', label: '＋ ' + t('create') }, { id: 'CUT', label: '✕ ' + t('cut') }], pick.action, x => setPick('action', x)));
    p.append(el('div', { class: 'hint' }, `${t('stepEdge')} — ${t('edgeHint')}`), chips(C.EDGES.map(k => ({ id: k, label: fe(k), off: !active.has(k) })), pick.edge, x => setPick('edge', x)));
    if (pick.node && pick.edge) { const ok = N.rules.getCommitment({ node: pick.node, action: 'CUT', edge: pick.edge }).committed; p.append(el('p', { class: ok ? 'hint' : 'hint warn', role: 'status' }, (ok ? '✓ ' : '! ') + t(ok ? 'cmtYes' : 'cmtNo', { n: pick.node }))); }
    p.append(el('div', { class: 'actions' }, [el('button', { class: 'primary', 'data-snd': '1', disabled: !(pick.node && pick.action && pick.edge) || (v.mode === 'online' && v.online.status !== 'connected'), onclick: confirmPick }, t('confirm')),
      el('button', { class: 'ghost', onclick: () => { pick = NOPICK(); render(); } }, t('clear'))]));
  } else {
    const rv = v.lastRound;
    p.append(el('h2', {}, t('reveal', { n: rv.round })));
    rv.choices.forEach((c, i) => p.append(el('p', { class: 'ln' }, choiceText(i, c, rv.commitments[i]))));
    rv.events.forEach(e => p.append(el('p', { class: 'ln' + (e.kind === 'conflict' ? ' cf' : '') }, (e.kind === 'conflict' ? '⚠ ' : '→ ') + evText(e))));
    if (v.result) p.append(el('div', { class: 'banner', role: 'status' }, resultText(v.result, v)), el('button', { class: 'primary', onclick: () => (v.mode === 'online' ? leaveOnline() : newGame()) }, t(v.mode === 'online' ? 'onlineLeave' : 'newGame')));
    else p.append(el('button', { class: 'primary', onclick: () => { if (v.mode === 'online') O.ackReveal(); else K.nextRound(session); render(); } }, t('nextRound')));
  }
}
function renderOnlineWait(p, v) { // neutral waiting screens: nothing about any choice is rendered here
  p.append(el('h2', {}, t(v.phase === 'connecting' ? 'onlineConnecting' : v.phase === 'lobby' ? 'onlineWaitOpp' : 'onlineLocked')));
  if (v.phase === 'lobby') p.append(el('p', { class: 'hint' }, t('onlineShareHint')), el('p', {}, [`${t('onlineCodeLabel')}: `, el('strong', { class: 'code' }, v.online.code || '')]), el('button', { onclick: copyCode }, t('onlineCopy')));
  if (v.phase === 'waiting' && v.hasPending[1 - v.turn]) p.append(el('p', { class: 'hint' }, t('onlineOppLocked')));
  p.append(el('p', { class: 'hint', role: 'status' }, connText(v)));
}
// Leaving a room asks for confirmation only when it could actually abandon a running game (opponent present, no result yet).
function leaveOnline() {
  const m = onl(), risky = m.active && m.game && !m.game.result && m.opponentPresent;
  if (risky && !window.confirm(t('confirmLeave'))) return;
  O.leave(); pick = NOPICK(); copyMsg = ''; render();
}
function copyCode() {
  const code = onl().code; if (!code) return; const box = $('#onlineCopyBox');
  const manual = () => { box.hidden = false; box.value = code; box.focus(); box.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } copyMsg = t(ok ? 'onlineCopied' : 'onlineCopyManual'); renderOnline(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(code).then(() => { copyMsg = t('onlineCopied'); renderOnline(); }, manual); else manual();
}
function renderOnline() {
  const m = onl(), v = m.active ? O.makeView() : null;
  $('#onlineMenu').hidden = m.active; $('#onlineRoom').hidden = !(m.active && m.code); $('#onlineCodeShown').textContent = m.code || '';
  $('#onlineStatus').textContent = v ? [connText(v), copyMsg].filter(Boolean).join(' ') : ''; $('#onlineError').textContent = m.error ? errText(m.error) : '';
  $('#onlineNeeds').textContent = O.wsUrl() ? '' : t('onlineNeedsServer'); $('#onlineRetry').hidden = !(m.status === 'failed' && m.code);
  $('#onlineBadge').textContent = v && m.playerIndex != null ? `🌐 ${t('onlineYouAre', { p: pname(m.playerIndex) })} · ${connText(v)}` : '';
}
function renderLog(v) { // compact ribbon: only completed rounds, so nothing hidden is ever shown here
  const log = $('#log'); log.replaceChildren();
  v.rounds.forEach(r => {
    const conflict = r.events.some(e => e.kind === 'conflict');
    const tags = r.changes.map(c => el('span', { class: 'tag ' + (c.after ? 'create' : 'cut'), 'aria-label': `${t(c.after ? 'edgeCreated' : 'edgeCut')} ${fe(c.edge)}` }, `${c.after ? '＋' : '✕'} ${fe(c.edge)}`));
    if (conflict) tags.push(el('span', { class: 'tag conflict' }, '⚠ ' + t('conflict')));
    if (!tags.length) tags.push(el('span', { class: 'tag none' }, t('noChange')));
    log.append(el('li', {}, [el('div', { class: 'rh' }, [el('span', {}, t('round', { n: r.round })), ...tags]), ...r.choices.map((c, i) => el('div', { class: 'sub' }, choiceText(i, c, r.commitments[i]))), el('div', { class: 'res' }, `${t('result')}: ` + r.events.map(evText).join(' | '))]));
  });
}
function renderSave() { $('#save').textContent = saveState === 'saved' ? '✓ ' + t('saved') : saveState ? '⚠ ' + t('storageOff') : ''; }
function renderTour() {
  const n = 3; $('#tourText').textContent = t('tour' + (tourStep + 1)); $('#tourDots').replaceChildren(...Array.from({ length: n }, (_, i) => el('i', { class: i === tourStep ? 'on' : '' })));
  $('#tourBack').disabled = tourStep === 0; $('#tourNext').textContent = t(tourStep === n - 1 ? 'tourDone' : 'tourNext');
}
function syncSettings() {
  const s = SND.get(); $('#soundOn').checked = s.enabled; $('#soundVol').value = String(Math.round(s.volume * 100)); $('#soundVol').disabled = !s.enabled; $('#soundTest').disabled = !s.enabled; $('#soundPreview').disabled = !s.enabled; $('#soundPreview').value = N.sound.SOUNDS[ui.soundPreview] ? ui.soundPreview : 'edgeCreated'; $('#themeMode').value = ['dark', 'light', 'system'].includes(ui.theme) ? ui.theme : 'dark'; $('#motionReduce').checked = ui.motion === 'off';
}
function applyStatic() {
  document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
  document.querySelectorAll('.tools button').forEach(b => { const l = b.querySelector('.lb'); if (l) b.title = l.textContent; });   // icon-only buttons on narrow screens keep a tooltip
  document.title = t('title') + ' V' + C.APP_VERSION; $('#ver').textContent = 'V' + C.APP_VERSION; $('#legend').textContent = t('legend'); $('#lang').setAttribute('aria-label', t('lang'));
  $('#rulesTitle').textContent = t('rulesTitle'); $('#rulesBody').replaceChildren(...t('rulesBody').split('\n').map(l => el('p', {}, l))); renderTour();
}
function render() {
  const v = curView(), on = onl().active;
  if (!on && session && session.state && session.state.result && N.games && archivedSession !== session) { N.games.recordFinished(session, store); archivedSession = session; }
  applyStatic(); renderPhase(v); renderBoard(v); renderCards(v); renderPanel(v); renderLog(v); renderSave(); renderOnline();
  ['#new', '#mode', '#exportBtn', '#importBtn'].forEach(q => { $(q).disabled = on; }); // local-only actions are off while a room is active
  $('#undo').disabled = !v.canUndo; $('#notice').textContent = onl().error ? errText(onl().error) : on ? t('onlineUndoOff') : notice;
  $('#modeChip').textContent = t(v.mode === 'online' ? 'online' : v.mode === 'ai' ? 'modeAi' : 'modeHvh'); $('#intro').hidden = ui.tour === 'done'; syncSettings();
  FB.observe(v);   // sounds come from real state CHANGES only; repeated renders of the same state are silent
  const sc = N.ui && N.ui.screens && N.ui.screens[curScreen]; if (sc && sc.render) sc.render();
}

const open = d => { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }, shut = d => { if (d.close) d.close(); else d.removeAttribute('open'); };
function importError(r) { const m = { TOO_BIG: 'impTooBig', PARSE: 'impParse', VERSION: 'impVersion' }[r.code]; return m ? t(m) : t('impInvalid', { r: r.round || '–' }); }
const endTour = () => { ui.tour = 'done'; saveUi(); shut($('#dlgTour')); render(); };
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b && !b.disabled && !b.dataset.snd) SND.play('click'); }, true);   // generic click tick; chips/confirm play their own sounds
document.addEventListener('pointerdown', () => SND.unlock(), true); document.addEventListener('keydown', () => SND.unlock(), true);
const setMenu = open => { $('#menu').hidden = !open; $('#menuBtn').setAttribute('aria-expanded', String(open)); };
$('#menuBtn').onclick = () => setMenu($('#menu').hidden);
document.addEventListener('click', e => { if (!$('#menu').hidden && !(e.target.closest && e.target.closest('.menuwrap'))) setMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#menu').hidden) { setMenu(false); $('#menuBtn').focus(); } });
$('#menu').addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) setMenu(false); });
// A backgrounded tab or a network change may have dropped the socket quietly: try to restore the seat right away when we are back.
const wake = () => { const m = onl(); if (m.active && (m.status === 'reconnecting' || m.status === 'failed')) O.retry(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); }); window.addEventListener('online', wake);
$('#new').onclick = () => newGame($('#mode').value);
$('#undo').onclick = () => { if (K.undo(session)) { archivedSession = null; pick = NOPICK(); FB.reset(); notice = ''; render(); save(); } };
$('#rules').onclick = () => open($('#dlgRules')); $('#rulesClose').onclick = () => shut($('#dlgRules'));
$('#rulesTour').onclick = () => { shut($('#dlgRules')); tourStep = 0; renderTour(); open($('#dlgTour')); };
$('#tourStart').onclick = () => { tourStep = 0; renderTour(); open($('#dlgTour')); };
$('#tourDismiss').onclick = () => { ui.tour = 'done'; saveUi(); render(); };
$('#tourBack').onclick = () => { if (tourStep > 0) { tourStep--; renderTour(); } };
$('#tourNext').onclick = () => { if (tourStep < 2) { tourStep++; renderTour(); } else endTour(); };
$('#tourSkip').onclick = () => endTour();
$('#settingsBtn').onclick = () => { syncSettings(); open($('#dlgSettings')); }; $('#settingsClose').onclick = () => shut($('#dlgSettings'));
$('#soundOn').onchange = () => { SND.setEnabled($('#soundOn').checked); syncSettings(); };
$('#soundVol').oninput = () => { SND.setVolume(Number($('#soundVol').value) / 100); };
$('#soundPreview').onchange = () => { ui.soundPreview = $('#soundPreview').value; saveUi(); };
$('#soundTest').onclick = () => { SND.play(N.sound.SOUNDS[ui.soundPreview] ? ui.soundPreview : 'edgeCreated'); };
$('#themeMode').onchange = () => { ui.theme = $('#themeMode').value; saveUi(); applyTheme(); render(); };
$('#motionReduce').onchange = () => { ui.motion = $('#motionReduce').checked ? 'off' : 'on'; saveUi(); applyMotion(); };
$('#exportBtn').onclick = () => {
  const text = St.exportHistory(session);
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = 'nori-v0.0.6-game.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  catch (e) { $('#exportText').value = text; open($('#dlgExport')); }
};
$('#exportClose').onclick = () => shut($('#dlgExport'));
$('#importBtn').onclick = () => { $('#importMsg').textContent = ''; $('#importText').value = ''; open($('#dlgImport')); };
$('#importClose').onclick = () => shut($('#dlgImport'));
$('#file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  if (f.size > 300000) { $('#importMsg').textContent = t('impTooBig'); return; }
  const fr = new FileReader(); fr.onload = () => { $('#importText').value = String(fr.result); }; fr.readAsText(f);
};
$('#importLoad').onclick = () => { // a failed import never replaces the current game
  const r = St.importHistory($('#importText').value);
  if (!r.ok) { $('#importMsg').textContent = importError(r); return; }
  shut($('#dlgImport')); setSession(r.session, t('importOk'));
};
$('#selftest').onclick = () => {
  const box = $('#tests'), suites = window.NORI_SUITES || {}, res = [];
  Object.keys(suites).forEach(n => { suites[n](N, window.NORI_HARNESS, { I18N: I }).forEach(r => res.push(Object.assign({ suite: n }, r))); });
  const pass = res.filter(r => r.ok && !r.skipped).length, fail = res.filter(r => !r.ok).length;
  box.hidden = false; box.replaceChildren(el('h2', {}, t('testsTitle', { a: pass, b: fail })), ...res.map(r => el('div', { class: r.skipped ? 'hint' : r.ok ? 'pass' : 'fail' }, (r.skipped ? '○ ' : r.ok ? '✓ ' : '✗ ') + r.suite + ': ' + r.name + (r.err ? ' — ' + r.err : ''))));
};
$('#mode').onchange = () => newGame($('#mode').value);
$('#onlineBtn').onclick = () => { copyMsg = ''; renderOnline(); open($('#dlgOnline')); };
$('#onlineClose').onclick = () => shut($('#dlgOnline'));
$('#onlineCreate').onclick = () => { O.createRoom(); };
$('#onlineJoin').onclick = () => { O.joinRoom($('#onlineCode').value); };
$('#onlineCopy').onclick = () => copyCode();
$('#onlineRetry').onclick = () => { O.retry(); };
$('#onlineLeave').onclick = () => leaveOnline();
$('#onlineCode').onkeydown = e => { if (e.key === 'Enter') $('#onlineJoin').onclick(); };
const sel = $('#lang'); I.list().forEach(l => sel.append(el('option', { value: l.code }, '🌐 ' + l.name)));
sel.value = I.setLang(I.detect(), false); sel.onchange = () => { I.setLang(sel.value, true); render(); }; applyMotion(); applyTheme();
// Screens: Play (default) and extra screens registered by other modules through NORI.ui.screens (e.g. tasks).
const SCREENS = ['play', 'tasks', 'games', 'lab', 'profile'], cap = n => n[0].toUpperCase() + n.slice(1);
function showScreen(name) {
  curScreen = name; SCREENS.forEach(n => { const m = $('#screen' + cap(n)), b = $('#nav' + cap(n)); if (m) m.hidden = n !== name; if (b) { b.classList.toggle('on', n === name); b.setAttribute('aria-current', n === name ? 'page' : 'false'); } });
  $('#hist').hidden = name !== 'play'; const sc = N.ui.screens[name]; if (sc && sc.show) sc.show(); if (sc && sc.render) sc.render(); window.scrollTo(0, 0);
}
$('#navPlay').onclick = () => showScreen('play'); $('#navTasks').onclick = () => showScreen('tasks'); $('#navGames').onclick = () => showScreen('games'); $('#navLab').onclick = () => showScreen('lab'); $('#navProfile').onclick = () => showScreen('profile');
N.ui = Object.assign(N.ui || {}, { el, fe, pname, aname, choiceText, chips, renderBoard, SND, open, shut, showScreen });
N.ui.screens = N.ui.screens || {};
const loaded = store ? St.loadSession(store) : { ok: false, code: 'STORAGE' };
if (loaded.ok) setSession(loaded.session); else { session = K.createSession($('#mode').value); render(); if (store) save(); else { saveState = 'storageOff'; renderSave(); } }
O.subscribe(() => { const e = onl().error; if (e && e !== lastNetErr) SND.play(e === 'CONNECTION' ? 'netError' : 'error'); lastNetErr = e; render(); });   // one tone per NEW error, never per render
if (O.hasSavedRoom()) O.resumeSaved(); // reload while in a room: restore the seat from the saved token or show a clear error
if (location.search.includes('tests')) $('#selftest').onclick();
})();
