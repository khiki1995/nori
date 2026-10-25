(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).graph = f; })(this, function (N, H) {
const { suite, eq, deq, ok, throwsCode, C } = H, { results, t } = suite(), g = N.graph, K = N.C;
t('10 nodes, 14 unique edges equal to the spec list', () => {
  eq(K.NODES.join(), '1,2,3,4,5,6,7,8,9,10'); eq(new Set(K.EDGES).size, 14);
  const spec = [[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,1],[2,7],[3,8],[4,9],[5,10]].map(p => [Math.min(...p), Math.max(...p)].join('-')).sort().join();
  eq(K.EDGES.slice().sort().join(), spec);
});
t('edge keys are canonical regardless of end order', () => { eq(K.edgeKey(10, 1), '1-10'); eq(K.edgeKey(1, 10), '1-10'); eq(K.edgeKey(7, 2), '2-7'); });
t('start network: exactly the 10 outer edges, every chord absent', () => {
  const s = N.state.createInitialState(); eq(s.edges.length, 10); deq(s.edges.slice().sort(), K.RING.slice().sort()); K.CHORDS.forEach(k => ok(!s.edges.includes(k), k));
});
t('players: sources and beacons per rules', () => {
  const [w, b] = K.PLAYERS; eq(w.source, 1); deq(w.beacons.slice().sort(), [4, 7]); eq(b.source, 6); deq(b.beacons.slice().sort(), [2, 9]);
});
t('connectivity is undirected', () => { ok(g.isConnected(['1-2'], 2, 1)); ok(g.isConnected(['1-2'], 1, 2)); ok(!g.isConnected(['1-2'], 1, 3)); ok(g.isConnected([], 4, 4)); });
t('connectivity equals independent Warshall closure on all 16384 edge subsets', () => {
  const pairs = [[1, 4], [1, 7], [6, 9], [6, 2]];
  for (let m = 0; m < 16384; m++) {
    const E = K.EDGES.filter((_, i) => m >> i & 1), r = Array.from({ length: 11 }, (_, i) => Array.from({ length: 11 }, (_, j) => i === j));
    E.forEach(k => { const [a, b] = g.edgeEnds(k); r[a][b] = r[b][a] = true; });
    for (let k = 1; k <= 10; k++) for (let i = 1; i <= 10; i++) for (let j = 1; j <= 10; j++) if (r[i][k] && r[k][j]) r[i][j] = true;
    pairs.forEach(([a, b]) => { if (g.isConnected(E, a, b) !== r[a][b]) throw new Error(`mask ${m} pair ${a}-${b}`); });
  }
});
t('invalid nodes and edges are rejected', () => {
  [0, 11, 1.5, '1', null, NaN].forEach(n => ok(!g.isValidNode(n), String(n)));
  ['1-5', '2-1', '10-1', '', null, '1-2-3'].forEach(k => ok(!g.isValidEdge(k), String(k)));
  throwsCode(() => N.rules.validateChoice(C(0, 'CUT', '1-2')), 'INVALID_NODE'); throwsCode(() => N.rules.validateChoice(C(1, 'cut', '1-2')), 'INVALID_ACTION');
  throwsCode(() => N.rules.validateChoice(C(1, 'CUT', '1-5')), 'INVALID_EDGE'); throwsCode(() => N.rules.validateChoice(null), 'INVALID_CHOICE');
});
return results;
});
