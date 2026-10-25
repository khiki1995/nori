(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).repetition = f; })(this, function (N, H) {
const { suite, eq, deq, ok, C } = H, { results, t } = suite(), R = N.rules, S = N.state;
const NOOP = [C(1, 'CREATE', '1-2'), C(5, 'CREATE', '5-6')];
t('the start position is counted once', () => { const s = S.createInitialState(); eq(s.seen[R.makeStateKey(s)], 1); eq(Object.keys(s.seen).length, 1); });
t('second occurrence does not end the game; third is a draw', () => {
  const k = R.makeStateKey(S.createInitialState()); let s = S.playRound(S.createInitialState(), NOOP); eq(s.result, null); eq(s.seen[k], 2);
  s = S.playRound(s, NOOP); eq(s.result.type, 'draw'); eq(s.result.code, 'THREEFOLD_REPETITION'); eq(s.seen[k], 3);
});
t('same network with different streak gives different keys', () => { const E = N.C.RING; ok(R.makeKey(E, [0, 0]) !== R.makeKey(E, [1, 0])); ok(R.makeKey(E, [1, 0]) !== R.makeKey(E, [0, 1])); eq(R.makeKey(E, [0, 0]), R.makeKey(E.slice().reverse(), [0, 0])); });
t('same network and streak but different repetition history: full keys differ', () => {
  const a = S.createInitialState(), b = S.createInitialState(); b.seen[R.makeStateKey(b)] = 2; b.seen['0000000000' + '0000|1,0'] = 1;
  eq(R.makeStateKey(a), R.makeStateKey(b)); ok(R.makeFullKey(a) !== R.makeFullKey(b));
});
t('undo restores edges, streak, seen, journal and result exactly', () => {
  let s = S.createInitialState(); const hist = [s];
  [[C(2, 'CREATE', '2-7'), C(1, 'CUT', '1-2')], [C(1, 'CREATE', '1-2'), C(9, 'CUT', '4-9')], [C(4, 'CREATE', '4-9'), C(3, 'CUT', '3-4')]].forEach(ch => { s = S.playRound(s, ch); hist.push(s); });
  while (hist.length > 1) { s = S.undoRound(s); hist.pop(); deq(s, hist[hist.length - 1]); }
  deq(S.undoRound(S.createInitialState()), S.createInitialState());
});
t('undo after a terminal result clears the result and the third repetition', () => {
  let s = S.playRound(S.createInitialState(), NOOP); const afterOne = s; s = S.playRound(s, NOOP); ok(s.result); s = S.undoRound(s); eq(s.result, null); deq(s, afterOne);
});
return results;
});
