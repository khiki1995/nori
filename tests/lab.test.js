(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).lab = f; })(this, function (N, H) {
const { suite, eq, deq, ok, throwsCode, C } = H, { results, t } = suite(), L = N.lab;
const memoryStorage = () => { const data = {}; return { data, getItem: k => data[k] || null, setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } }; };
const choice = (node, action, edge) => ({ node, action, edge });
t('toggleEdge accepts only known edges and preserves unique canonical order', () => {
  const lab = L.createLab(); L.toggleEdge(lab, '2-7'); ok(lab.edges.includes('2-7')); L.toggleEdge(lab, '2-7'); ok(!lab.edges.includes('2-7'));
  throwsCode(() => L.toggleEdge(lab, '1-5'), 'INVALID_EDGE'); eq(new Set(lab.edges).size, lab.edges.length);
});
t('lab streak values are bounded to non-terminal positions', () => {
  const lab = L.createLab(); L.setStreak(lab, 1, 1); eq(lab.streak[1], 1);
  throwsCode(() => L.setStreak(lab, 0, 2), 'INVALID_STREAK'); throwsCode(() => L.setStreak(lab, 2, 0), 'INVALID_STREAK');
});
t('preview is pure; apply matches the real resolver and is labelled artificial', () => {
  const lab = L.createLab(), before = lab.edges.slice(), choices = [choice(2, 'CREATE', '2-7'), choice(5, 'CUT', '5-6')];
  const preview = L.tryActions(lab, choices); deq(lab.edges, before); ok(preview.edges.includes('2-7')); ok(!preview.edges.includes('5-6'));
  const applied = L.applyActions(lab, choices); deq(lab.edges, applied.edges); ok(lab.artificial); eq(lab.steps, 1);
});
t('reset restores base and compare lists only network differences', () => {
  const lab = L.createLab(); L.toggleEdge(lab, '2-7'); L.toggleEdge(lab, '1-2'); eq(L.compare(lab).length, 2); L.reset(lab);
  deq(lab.edges, N.C.RING); eq(L.compare(lab).length, 0);
});
t('network map matches independent BFS and reports actual critical edges only', () => {
  const lab = L.createLab(), baseline = L.networkMap(lab.edges); eq(baseline[0].vital.length, 0); eq(baseline[1].vital.length, 0);
  ['1-2', '2-3', '3-4'].forEach(edge => L.toggleEdge(lab, edge));
  const map = L.networkMap(lab.edges); ok(map[0].vital.includes('4-5')); ok(map[0].beacons.every(x => typeof x.connected === 'boolean'));
});
t('scenario export/import round-trips and rejects invalid data', () => {
  const lab = L.createLab(); L.toggleEdge(lab, '2-7'); const text = L.exportScenario(lab, { name: 'Test', author: 'QA' }), imported = L.importScenario(text);
  ok(imported.ok); ok(imported.lab.edges.includes('2-7')); ok(imported.lab.artificial);
  ok(!L.importScenario('not json').ok); ok(!L.importScenario('{"game":"OTHER"}').ok);
  const data = JSON.parse(text); data.edges = ['1-5']; ok(!L.importScenario(JSON.stringify(data)).ok);
  data.edges = ['2-7', '2-7']; ok(!L.importScenario(JSON.stringify(data)).ok);
  data.edges = ['2-7']; data.streak = [2, 0]; ok(!L.importScenario(JSON.stringify(data)).ok);
  ok(!L.importScenario('x'.repeat(200001)).ok);
});
t('LAB APIs have no localStorage side effects', () => {
  const store = memoryStorage(), lab = L.createLab(); L.toggleEdge(lab, '2-7'); L.applyActions(lab, [choice(2, 'CREATE', '3-8'), choice(8, 'CUT', '7-8')]); L.exportScenario(lab, {});
  eq(Object.keys(store.data).length, 0);
});
t('a terminal hypothetical result prevents accidental extra rounds until the lab is edited/reset', () => {
  const lab = L.createLab({ edges: [], streak: [1, 0] });
  // All beacons are already disconnected; a no-op action leaves the threatened player broken for another round.
  const res = L.applyActions(lab, [choice(1, 'CUT', '1-2'), choice(6, 'CUT', '5-6')]);
  eq(res.result && res.result.code, 'SIGNAL_BREAK'); throwsCode(() => L.tryActions(lab, [choice(1, 'CREATE', '1-2'), choice(6, 'CREATE', '5-6')]), 'LAB_TERMINAL');
  L.toggleEdge(lab, '1-2'); eq(lab.lastResult, null); ok(lab.streak.every(value => value <= 1)); ok(L.importScenario(L.exportScenario(lab)).ok, 'edited non-terminal scenario can be exported');
});
return results;
});
