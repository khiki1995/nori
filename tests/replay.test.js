(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).replay = f; })(this, function (N, H) {
const { suite, eq, deq, ok, C } = H, { results, t } = suite(), S = N.state, RP = N.replay;
const NOOP = [C(2, 'CREATE', '2-7'), C(7, 'CUT', '2-7')];
const play = choices => choices.reduce((state, pair) => S.playRound(state, pair), S.createInitialState());
t('timeline contains initial state and one snapshot per completed round', () => {
  const state = play([NOOP, NOOP]), timeline = RP.buildTimeline(state);
  eq(timeline.length, 3); eq(timeline[0].index, 0); eq(timeline[0].record, null);
  deq(timeline[1].edges, state.rounds[0].edgesAfter); deq(timeline[2].edges, state.edges);
  deq(timeline[2].beacons, [0, 1].map(p => N.rules.getBeaconStatus(state.edges, p)));
});
t('verification accepts an intact log and rejects tampered round records', () => {
  const state = play([NOOP, NOOP]); ok(RP.verify(state).ok, JSON.stringify(RP.verify(state)));
  const bad = S.cloneState(state); bad.rounds[0].edgesAfter = ['1-2'];
  ok(!RP.verify(bad).ok); ok(RP.verify(bad).issues.length > 0);
});
t('navigation clamps at both ends and never mutates the game state', () => {
  const state = play([NOOP, NOOP]), before = JSON.stringify(state), replay = RP.createReplay(state);
  replay.first(); ok(replay.atStart); eq(replay.prev().index, 0);
  replay.last(); ok(replay.atEnd); eq(replay.next().index, 2);
  replay.go(1); deq(replay.current().edges, state.rounds[0].edgesAfter); replay.go(-50); ok(replay.atStart);
  eq(JSON.stringify(state), before);
});
t('full replay reproduces terminal result, edges and streak', () => {
  const state = play([NOOP, NOOP]), last = RP.createReplay(state).last();
  deq(last.edges, state.edges); deq(last.streak, state.streak); deq(last.result, state.result); eq(last.result.code, 'THREEFOLD_REPETITION');
});
t('verification rejects a corrupted action or record after terminal result', () => {
  const state = play([NOOP, NOOP]), bad = S.cloneState(state);
  bad.rounds[0].choices[0].edge = '1-5'; ok(!RP.verify(bad).ok);
  const extra = S.cloneState(state); extra.rounds.push(extra.rounds[0]); ok(!RP.verify(extra).ok);
});
return results;
});
