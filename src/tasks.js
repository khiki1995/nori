// Task engine: every answer is checked by the REAL game engine (NORI.rules / NORI.state), never by a hand-written expectation.
// Stored `expected*` fields in the data are only a regression guard: the tests require them to equal what the engine computes.
(function (G) {
'use strict';
const N = G.NORI = G.NORI || {}, C = N.C, R = N.rules, S = N.state, g = N.graph, KEY = 'nori.tasks.v1';
const plain = c => ({ node: c.node, action: c.action, edge: c.edge });
const cls = c => `${c.edge}|${c.action}|${R.getCommitment(c).committed ? 'C' : 'U'}`;   // abstract class of a concrete choice (edge, action, committed)
const edgesOf = spec => (spec === 'ring' ? C.RING.slice() : spec === 'all' ? C.EDGES.slice() : spec.slice());
function makeState(pos) { const s = S.createInitialState(); s.edges = g.canonicalEdges(new Set(edgesOf(pos.edges))); s.streak = (pos.streak || [0, 0]).slice(); s.seen = {}; s.seen[R.makeStateKey(s)] = 1; return s; }
const pairOf = (me, mine, theirs) => (me === 0 ? [plain(mine), plain(theirs)] : [plain(theirs), plain(mine)]);

// For every one of the 56 action classes: does it win by force / keep a Beacon connected against EVERY opponent reply, and which reply beats it?
function analyze(state, me) {
  const AB = N.ai.ABSTRACT;
  return AB.map(m => {
    let forced = true, notBroken = true, counterForced = null, counterBroken = null;
    AB.forEach(o => {
      const s = S.stepCore(state.edges, state.streak, state.seen, pairOf(me, m, o)), win = !!s.result && s.result.type === 'win' && s.result.winner === me;
      if (!win) { forced = false; counterForced = counterForced || plain(o); }
      if (R.isBroken(s.resolved.edges, me)) { notBroken = false; counterBroken = counterBroken || plain(o); }
    });
    return { cls: cls(m), choice: plain(m), forced, notBroken, counterForced, counterBroken };
  });
}
const acceptedClasses = task => analyze(makeState(task.position), task.me).filter(r => r[task.goal]).map(r => r.cls).sort();
function checkAction(task, choice) {
  R.validateChoice(choice); const row = analyze(makeState(task.position), task.me).find(r => r.cls === cls(choice)), ok = !!row[task.goal];
  return { ok, cls: row.cls, counter: ok ? null : (task.goal === 'forced' ? row.counterForced : row.counterBroken) };
}
const committedItems = task => task.items.map((it, i) => (R.getCommitment({ node: it.node, action: 'CUT', edge: it.edge }).committed ? i : -1)).filter(i => i >= 0);
const resolvedExists = task => { const st = makeState(task.position); return R.resolveRoundChoices(st.edges, task.choices).edges.includes(task.question.edge); };
const bridgeSet = task => { const E = makeState(task.position).edges, src = C.PLAYERS[task.me].source; return E.filter(k => !g.isConnected(E.filter(x => x !== k), task.beacon, src)).sort(); };
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
// Challenge: the player moves, a scripted opponent repeats one fixed choice; real engine plays every round.
const challengeStart = task => makeState(task.start);
function challengeStep(task, state, choice) { R.validateChoice(choice); return S.playRound(state, pairOf(task.me, choice, task.opponent)); }
function challengeStatus(task, state) {
  if (state.result) return state.result.type === 'win' && state.result.winner === task.me && state.rounds.length <= task.limit ? 'won' : 'failed';
  return state.rounds.length >= task.limit ? 'failed' : 'ongoing';
}
function playSequence(task, choices) { let st = challengeStart(task); for (const c of choices) { if (st.result) break; st = challengeStep(task, st, c); } return { state: st, status: challengeStatus(task, st) }; }
// Shortest possible win (relaxed search that ignores repetition; the reference replay below confirms it with the full rules).
function minimalRounds(task, maxDepth) {
  let layer = [{ edges: challengeStart(task).edges, streak: task.start.streak || [0, 0] }]; const seen = new Set([R.makeKey(layer[0].edges, layer[0].streak)]);
  for (let d = 1; d <= maxDepth; d++) {
    const next = [];
    for (const n of layer) for (const m of N.ai.ABSTRACT) {
      const s = S.stepCore(n.edges, n.streak, {}, pairOf(task.me, m, task.opponent));
      if (s.result && s.result.type === 'win' && s.result.winner === task.me) return d; if (s.result) continue;
      const k = R.makeKey(s.resolved.edges, s.streak); if (!seen.has(k)) { seen.add(k); next.push({ edges: s.resolved.edges, streak: s.streak }); }
    }
    layer = next;
  }
  return null;
}
const CATEGORIES = ['tutorial', 'connectivity', 'defense', 'attack', 'challenge'];
const textOf = (task, lang) => task.text[lang] || task.text.en;
function validateTask(task) {
  const bad = m => { throw new Error(`${task.id}: ${m}`); };
  if (!task.id || !CATEGORIES.includes(task.category)) bad('id/category'); if (!task.text || !task.text.en || !task.text.en.title || !task.text.en.desc || !task.text.en.explain) bad('English text');
  if (task.me !== 0 && task.me !== 1) bad('me');
  if (task.kind === 'commit') { if (!task.items.length || !sameSet(task.expectedItems, committedItems(task))) bad('commit items differ from the engine: ' + JSON.stringify(committedItems(task))); }
  else if (task.kind === 'resolve') { task.choices.forEach(R.validateChoice); if (resolvedExists(task) !== task.expectedExists) bad('resolve answer differs from the engine'); }
  else if (task.kind === 'bridges') { if (!sameSet(task.expectedEdges, bridgeSet(task))) bad('bridge set differs from the engine: ' + bridgeSet(task).join()); }
  else if (task.kind === 'action') { if (!['forced', 'notBroken'].includes(task.goal)) bad('goal'); if (!sameSet(task.expectedClasses, acceptedClasses(task))) bad('accepted classes differ from the engine: ' + acceptedClasses(task).join()); if (!task.expectedClasses.length) bad('no accepted answer'); }
  else if (task.kind === 'challenge') {
    R.validateChoice(task.opponent); const p = playSequence(task, task.reference); if (p.status !== 'won') bad('reference solution does not win within the limit'); if (task.reference.length > task.limit) bad('reference longer than the limit');
    if (minimalRounds(task, task.limit) !== task.minimalRounds) bad('minimal rounds differ from the engine search: ' + minimalRounds(task, task.limit));
  } else bad('unknown kind');
  return true;
}
function loadProgress(st) { try { const d = JSON.parse(st.getItem(KEY) || '{}'); return { solved: d.solved && typeof d.solved === 'object' ? d.solved : {}, attempts: d.attempts && typeof d.attempts === 'object' ? d.attempts : {} }; } catch (e) { return { solved: {}, attempts: {} }; } }
function saveProgress(st, p) { try { st.setItem(KEY, JSON.stringify(p)); return true; } catch (e) { return false; } }
N.tasks = { KEY, CATEGORIES, makeState, analyze, acceptedClasses, checkAction, committedItems, resolvedExists, bridgeSet, sameSet, challengeStart, challengeStep, challengeStatus, playSequence, minimalRounds, textOf, validateTask, loadProgress, saveProgress, cls };
})(typeof window !== 'undefined' ? window : globalThis);
