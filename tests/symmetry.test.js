(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).symmetry = f; })(this, function (N, H) {
const { suite, eq, deq, ok, C } = H, { results, t } = suite(), K = N.C, R = N.rules, S = N.state, g = N.graph, rot = K.rot180;
const rotE = k => K.edgeKey(...g.edgeEnds(k).map(rot)), rotEs = E => g.canonicalEdges(new Set(E.map(rotE))), rotC = c => C(rot(c.node), c.action, rotE(c.edge));
// NOTE: these tests check a symmetry PROPERTY of the implementation; they do not compute anything independently.
t('180-degree rotation maps ring->ring, chords->chords, sources and beacons', () => {
  deq(rotEs(K.RING), g.canonicalEdges(new Set(K.RING))); deq(rotEs(K.CHORDS), g.canonicalEdges(new Set(K.CHORDS)));
  eq(rot(1), 6); eq(rot(6), 1); eq(rot(4), 9); eq(rot(7), 2); eq(rot(2), 7); eq(rot(9), 4); [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(n => eq(rot(rot(n)), n));
  eq(rot(K.PLAYERS[0].source), K.PLAYERS[1].source); deq(K.PLAYERS[0].beacons.map(rot).sort(), K.PLAYERS[1].beacons.slice().sort());
});
t('resolution is symmetric under rotation + player swap (all 280x280 pairs, 2 networks)', () => {
  const all = []; K.NODES.forEach(n => K.ACTIONS.forEach(a => K.EDGES.forEach(e => all.push(C(n, a, e)))));
  [K.RING.slice(), g.canonicalEdges(new Set(['1-2', '2-7', '4-9', '5-10', '6-7']))].forEach(E => all.forEach(w => all.forEach(b => {
    const a1 = R.resolveRoundChoices(E, [w, b]).edges, a2 = R.resolveRoundChoices(rotEs(E), [rotC(b), rotC(w)]).edges; if (a2.join() !== rotEs(a1).join()) throw new Error(JSON.stringify([w, b]));
  })));
});
t('a rotated Signal Break position gives the mirrored winner', () => {
  const NOOP = [C(1, 'CREATE', '1-2'), C(5, 'CREATE', '5-6')], WB = ['1-2', '2-3', '8-9', '9-10', '1-10', '5-6', '5-10'];
  const mk = (E, streak) => { const s = S.createInitialState(); s.edges = g.canonicalEdges(new Set(E)); s.streak = streak; s.seen = {}; s.seen[R.makeStateKey(s)] = 1; return s; };
  const a = S.playRound(S.playRound(mk(WB, [0, 0]), NOOP), NOOP), b = S.playRound(S.playRound(mk(rotEs(WB), [0, 0]), [rotC(NOOP[1]), rotC(NOOP[0])]), [rotC(NOOP[1]), rotC(NOOP[0])]);
  eq(a.result.winner, 1); eq(b.result.winner, 0); eq(b.result.code, a.result.code);
});
return results;
});
