(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).terminal = f; })(this, function (N, H) {
const { suite, eq, deq, ok, throwsCode, C } = H, { results, t } = suite(), R = N.rules, S = N.state, g = N.graph;
const NOOP = [C(1, 'CREATE', '1-2'), C(5, 'CREATE', '5-6')];
const fixture = (edges, streak) => { const s = S.createInitialState(); s.edges = g.canonicalEdges(new Set(edges)); s.streak = streak || [0, 0]; s.seen = {}; s.seen[R.makeStateKey(s)] = 1; return s; };
const WB = ['1-2', '2-3', '8-9', '9-10', '1-10', '5-6', '5-10']; // White beacons 4 and 7 cut off; Black still connected
t('beacon status: none, one, or both beacons cut', () => {
  const E = N.C.RING.filter(k => k !== '3-4' && k !== '4-5'); deq(R.getBeaconStatus(E, 0), [false, true]); ok(!R.isBroken(E, 0));
  deq(R.getBeaconStatus(WB, 0), [false, false]); ok(R.isBroken(WB, 0)); ok(!R.isBroken(WB, 1)); deq(R.getBeaconStatus(N.C.RING, 1), [true, true]);
});
t('one broken round does not win', () => { const s = S.playRound(fixture(WB), NOOP); deq(s.streak, [1, 0]); eq(s.result, null); });
t('two consecutive broken rounds: opponent wins, with a structured result', () => {
  const s = S.playRound(S.playRound(fixture(WB), NOOP), NOOP); eq(s.result.type, 'win'); eq(s.result.winner, 1); eq(s.result.loser, 0); eq(s.result.code, 'SIGNAL_BREAK'); eq(s.result.reason, 'signal_break'); deq(s.streak, [2, 0]);
});
t('restoring one path resets the streak', () => {
  let s = S.playRound(fixture(WB), NOOP); s = S.playRound(s, [C(3, 'CREATE', '3-4'), C(5, 'CREATE', '5-6')]); deq(s.streak, [0, 0]); eq(s.result, null);
});
t('simultaneous Signal Break at the end of one round: draw', () => {
  const s0 = fixture([]), cut = [C(1, 'CUT', '1-2'), C(5, 'CUT', '5-6')]; const s = S.playRound(S.playRound(s0, cut), cut);
  eq(s.result.type, 'draw'); eq(s.result.winner, null); eq(s.result.code, 'SIMULTANEOUS_SIGNAL_BREAK');
});
t('staggered breaks (2 vs 1): the player with streak 2 loses, not a draw', () => {
  const r1 = S.playRound(fixture(WB), NOOP), r2 = S.playRound(r1, [C(1, 'CREATE', '1-2'), C(5, 'CUT', '5-10')]); deq(r2.streak, [2, 1]); eq(r2.result.type, 'win'); eq(r2.result.winner, 1);
});
t('Signal Break is checked before repetition and is not overwritten by it', () => {
  const s0 = fixture(WB, [1, 0]); s0.seen[R.makeKey(s0.edges, [2, 0])] = 2; const s = S.playRound(s0, NOOP);
  eq(s.result.code, 'SIGNAL_BREAK'); eq(s.seen[R.makeKey(s0.edges, [2, 0])], 2, 'seen must not be updated on a Signal Break round');
});
t('full 6-round game ends exactly at round 6 with a Black win', () => {
  let s = S.createInitialState();
  [C(5, 'CREATE', '5-10'), C(3, 'CUT', '3-4'), C(4, 'CUT', '4-5'), C(6, 'CUT', '6-7'), C(7, 'CUT', '7-8'), C(5, 'CREATE', '5-6')].forEach((b, i) => { eq(s.result, null, 'ended early at ' + i); s = S.playRound(s, [C(1, 'CREATE', '1-2'), b]); });
  eq(s.result.winner, 1); eq(s.rounds.length, 6);
});
t('getTerminalResult agrees with playRound', () => { const s = S.playRound(S.playRound(fixture(WB), NOOP), NOOP); deq(S.getTerminalResult(s), s.result); eq(S.getTerminalResult(S.createInitialState()), null); });
t('rounds after the end are rejected; streak counters stay within 0..2', () => {
  const s = S.playRound(S.playRound(fixture(WB), NOOP), NOOP); throwsCode(() => S.playRound(s, NOOP), 'GAME_OVER'); s.streak.forEach(x => ok(x >= 0 && x <= 2));
});
return results;
});
