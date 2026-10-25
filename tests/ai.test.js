(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).ai = f; })(this, function (N, H) {
const { suite, eq, deq, ok, C } = H, { results, t } = suite(), S = N.state, R = N.rules, g = N.graph;
t('56 abstract choices map to concrete legal choices with the stated commitment', () => {
  eq(N.ai.ABSTRACT.length, 56); eq(new Set(N.ai.ABSTRACT.map(a => a.edge + a.action + a.committed)).size, 56);
  N.ai.ABSTRACT.forEach(a => { R.validateChoice(a); eq(R.getCommitment(a).committed, a.committed, JSON.stringify(a)); });
});
t('AI returns a legal choice and is deterministic', () => {
  const s = S.createInitialState(), a = N.ai.chooseAIAction(s, 1), b = N.ai.chooseAIAction(s, 1); R.validateChoice(a); deq(a, b);
});
t('AI does not mutate the state it evaluates', () => { const s = S.createInitialState(), before = JSON.stringify(s); N.ai.chooseAIAction(s, 0); N.ai.chooseAIAction(s, 1); eq(JSON.stringify(s), before); });
t('AI picks the candidate with the best worst-case value (maximin, average tie-break)', () => {
  const s = S.createInitialState(), list = N.ai.evaluateCandidates(s, 1), pick = N.ai.chooseAIAction(s, 1);
  const best = list.reduce((m, c) => (c.min > m.min || (c.min === m.min && c.avg > m.avg) ? c : m), list[0]);
  const chosen = list.find(c => JSON.stringify(c.choice) === JSON.stringify(pick)); eq(chosen.min, best.min); eq(chosen.avg, best.avg);
});
t('20 catalog profiles produce legal AI choices with more than one opening policy', () => {
  const profiles = typeof require === 'function' ? require('../src/bots-data.json') : N.bots.list(), prior = N.bots, picks = [];
  N.bots = { get: id => profiles.find(b => b.id === id) || null };
  try {
    const state = S.createInitialState();
    profiles.forEach(bot => { const choice = N.ai.chooseAIAction(state, 1, bot.id); R.validateChoice(choice); picks.push(JSON.stringify(choice)); });
    eq(profiles.length, 20); ok(new Set(picks).size > 1, 'catalog personalities should change at least some opening choices');
  } finally { if (prior) N.bots = prior; else delete N.bots; }
});
t('when Black is broken with streak 1, the AI tries to reconnect a beacon instead of passing', () => {
  const E = g.canonicalEdges(new Set(['6-7', '7-8', '3-4', '4-5', '5-6', '1-10', '5-10'])), s = S.createInitialState();
  s.edges = E; s.streak = [0, 1]; s.seen = {}; s.seen[R.makeStateKey(s)] = 1; ok(R.isBroken(E, 1) && !R.isBroken(E, 0));
  const pick = N.ai.chooseAIAction(s, 1), after = N.state.stepCore(s.edges, s.streak, s.seen, [C(1, 'CREATE', '1-10'), pick]).resolved.edges;
  eq(pick.action, 'CREATE'); ok(!R.isBroken(after, 1), 'AI choice should reconnect at least one Black beacon: ' + JSON.stringify(pick));
});
t('AI self-play: legal moves every round, reproducible, ends or reaches the 60-round cap without errors', () => {
  const play = () => { let s = S.createInitialState(), log = []; while (!s.result && s.rounds.length < 60) { const ch = [N.ai.chooseAIAction(s, 0), N.ai.chooseAIAction(s, 1)]; ch.forEach(R.validateChoice); log.push(ch); s = S.playRound(s, ch); } return { log, result: s.result }; };
  const a = play(), b = play(); deq(a, b); ok(a.log.length >= 1);
});
t('position evaluation mirrors under 180-degree rotation with sides swapped', () => {
  const edges = g.canonicalEdges(new Set(['1-2','2-3','3-4','4-5','6-7','7-8','8-9','9-10','2-7','5-10']));
  const rotateEdge = edge => { const [a,b] = g.edgeEnds(edge); return N.C.edgeKey(N.C.rot180(a), N.C.rot180(b)); };
  const rotated = g.canonicalEdges(new Set(edges.map(rotateEdge)));
  const score = N.ai.positionScore(edges, [1,0]);
  eq(N.ai.positionScore(rotated, [0,1]), -score, 'rotated evaluation must flip sign');
});
t('the evaluator discourages a neutral nonterminal repeat for both players', () => {
  const state = S.createInitialState();
  const pair = [C(1, 'CREATE', '1-2'), C(1, 'CREATE', '1-2')];
  eq(N.ai.pairValue(state, pair, 0), -16);
  eq(N.ai.pairValue(state, pair, 1), -16);
});
t('repeated-state history penalizes reusing the same move from that position', () => {
  const state = S.createInitialState(), k = R.makeStateKey(state);
  state.seen[k] = 2;
  const prior = C(1, 'CUT', '1-2');
  state.rounds = [
    { edgesAfter: state.edges.slice(), streakAfter: [0,0], choices: [C(2,'CREATE','2-3'), C(3,'CREATE','3-4')] },
    { edgesAfter: state.edges.slice(), streakAfter: [0,0], choices: [prior, C(4,'CUT','4-5')] }
  ];
  eq(N.ai.cycleBreakBias(state, 0, prior), -8);
  eq(N.ai.cycleBreakBias(state, 0, C(2, 'CREATE', '2-3')), 0);
});
t('fast bitmask analysis equals the frozen rules (stepCore) on every choice pair of sampled positions', () => {
  const F = N.ai._fast, A = N.ai.ABSTRACT, plain = c => ({ node: c.node, action: c.action, edge: c.edge });
  let st = S.createInitialState(), checked = 0, seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  for (let pos = 0; pos < 6 && !st.result; pos++) {
    const mask = F.edgeMask(st.edges);
    for (let i = 0; i < A.length; i += 3) for (let j = 0; j < A.length; j++) {
      const ref = S.stepCore(st.edges, st.streak, st.seen, [plain(A[i]), plain(A[j])]), fast = F.stepFast(mask, st.streak, st.seen, F.FAST[i], F.FAST[j]);
      eq(fast.mask, F.edgeMask(ref.resolved.edges), 'edges ' + i + '/' + j); deq([fast.s0, fast.s1], ref.streak, 'streak');
      eq(fast.result ? fast.result.code : null, ref.result ? ref.result.code : null, 'result'); eq(fast.result ? fast.result.winner : null, ref.result ? ref.result.winner : null, 'winner');
      eq(fast.seenCount, ref.seenCount, 'seenCount'); checked++;
    }
    st = S.playRound(st, [plain(A[rnd(A.length)]), plain(A[rnd(A.length)])]);
  }
  ok(checked > 3000, 'checked ' + checked);
});
return results;
});
