(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).resolution = f; })(this, function (N, H) {
const { suite, eq, deq, ok, throwsCode, C } = H, { results, t } = suite(), R = N.rules, K = N.C, RING = K.RING.slice();
const res = (E, w, b) => R.resolveRoundChoices(E, [w, b]);
t('commitment: both ends are committed, other nodes are not', () => {
  eq(R.getCommitment(C(2, 'CREATE', '2-7')).committed, true); eq(R.getCommitment(C(7, 'CREATE', '2-7')).committed, true);
  eq(R.getCommitment(C(3, 'CREATE', '2-7')).committed, false); eq(R.getCommitment(C(1, 'CUT', '1-10')).committed, true); eq(R.getCommitment(C(10, 'CUT', '1-10')).committed, true);
});
t('CREATE on absent adds, on existing is a no-op', () => { const a = res(RING, C(2, 'CREATE', '2-7'), C(5, 'CREATE', '5-6')); ok(a.edges.includes('2-7')); eq(a.events[0].changed, true); eq(a.events[1].changed, false); });
t('CUT on existing removes, on absent is a no-op', () => { const a = res(RING, C(1, 'CUT', '1-2'), C(2, 'CUT', '2-7')); ok(!a.edges.includes('1-2')); eq(a.events[0].changed, true); eq(a.events[1].changed, false); });
t('different edges: both applied, order does not matter', () => {
  const w = C(2, 'CREATE', '2-7'), b = C(1, 'CUT', '1-2'), a = res(RING, w, b), c = res(RING, b, w);
  ok(a.edges.includes('2-7') && !a.edges.includes('1-2')); deq(a.edges, c.edges);
});
t('same edge, same action: applied once (CREATE and CUT)', () => {
  const a = res(RING, C(2, 'CREATE', '2-7'), C(7, 'CREATE', '2-7')); eq(a.events.length, 1); eq(a.events[0].kind, 'merged'); eq(a.edges.length, 11);
  const b = res(RING, C(9, 'CUT', '1-2'), C(1, 'CUT', '1-2')); eq(b.events.length, 1); eq(b.edges.length, 9);
});
t('opposite actions: only White committed -> White wins', () => { const r = res(RING, C(1, 'CUT', '1-2'), C(5, 'CREATE', '1-2')); ok(!r.edges.includes('1-2')); eq(r.events[0].kind, 'override'); eq(r.events[0].winner, 0); });
t('opposite actions: only Black committed -> Black wins', () => { const r = res(RING, C(5, 'CREATE', '1-2'), C(1, 'CUT', '1-2')); ok(!r.edges.includes('1-2')); eq(r.events[0].winner, 1); const q = res(RING, C(5, 'CUT', '2-7'), C(2, 'CREATE', '2-7')); ok(q.edges.includes('2-7')); });
t('opposite actions: both committed -> conflict, edge unchanged', () => { const r = res(RING, C(2, 'CREATE', '2-7'), C(7, 'CUT', '2-7')); eq(r.events[0].kind, 'conflict'); deq(r.edges, RING); deq(r.changes, []); deq(r.events[0].committed, [true, true]); });
t('opposite actions: neither committed -> conflict, edge unchanged', () => { const r = res(RING, C(9, 'CUT', '1-2'), C(8, 'CREATE', '1-2')); eq(r.events[0].kind, 'conflict'); deq(r.edges, RING); deq(r.events[0].committed, [false, false]); });
t('resolution does not mutate its input', () => { const E = RING.slice(), ch = [C(1, 'CUT', '1-2'), C(2, 'CREATE', '2-7')], before = JSON.stringify([E, ch]); res(E, ch[0], ch[1]); eq(JSON.stringify([E, ch]), before); });
t('invalid choices are rejected', () => { throwsCode(() => res(RING, C(1, 'CUT', '1-9'), C(1, 'CUT', '1-2')), 'INVALID_EDGE'); throwsCode(() => R.resolveRoundChoices(RING, [C(1, 'CUT', '1-2')]), 'INVALID_CHOICES'); });
t('matches an independent oracle for all 280x280 choice pairs on 3 networks (235,200 cases)', () => {
  const oracle = (E, w, b) => { const inc = c => c.edge.split('-').map(Number).includes(c.node), out = new Set(E), ap = c => (c.action === 'CREATE' ? out.add(c.edge) : out.delete(c.edge));
    if (w.edge !== b.edge) { ap(w); ap(b); } else if (w.action === b.action) ap(w); else { const x = inc(w), y = inc(b); if (x && !y) ap(w); else if (y && !x) ap(b); } return K.EDGES.filter(k => out.has(k)); };
  const all = []; K.NODES.forEach(n => K.ACTIONS.forEach(a => K.EDGES.forEach(e => all.push(C(n, a, e)))));
  let n = 0; [RING, K.EDGES.slice(), []].forEach(E => all.forEach(w => all.forEach(b => { n++; if (res(E, w, b).edges.join() !== oracle(E, w, b).join()) throw new Error(JSON.stringify([w, b])); })));
  eq(n, 235200);
});
return results;
});
