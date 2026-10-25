// Replay timeline and deterministic integrity verification for completed/local game state.
(function (G) {
'use strict';
const N = G.NORI, R = N.rules, S = N.state;
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function buildTimeline(state) {
  if (!state || !Array.isArray(state.rounds) || !Array.isArray(state.edges) || !Array.isArray(state.streak)) {
    throw R.fail('INVALID_REPLAY_STATE');
  }
  const initial = S.createInitialState();
  const timeline = [{
    index: 0, round: 0, edges: initial.edges.slice(), streak: initial.streak.slice(),
    beacons: [0, 1].map(p => R.getBeaconStatus(initial.edges, p)),
    record: null, result: null, seen: clone(initial.seen)
  }];
  state.rounds.forEach((record, i) => {
    const edges = record.edgesAfter.slice();
    timeline.push({
      index: i + 1, round: record.round, edges,
      streak: record.streakAfter.slice(),
      beacons: [0, 1].map(p => R.getBeaconStatus(edges, p)),
      record, result: record.result ? clone(record.result) : null,
      seen: null
    });
  });
  return timeline;
}

// Replay choices through the real engine and compare the generated journal, not only the board.
function verify(state) {
  const issues = [];
  if (!state || !Array.isArray(state.rounds)) return { ok: false, issues: ['invalid state'] };
  let replayed = S.createInitialState();
  for (let i = 0; i < state.rounds.length; i++) {
    const source = state.rounds[i];
    try {
      if (!source || !Array.isArray(source.choices) || source.choices.length !== 2) {
        issues.push(`round ${i + 1}: choices`); break;
      }
      replayed = S.playRound(replayed, source.choices);
    } catch (error) {
      issues.push(`round ${i + 1}: ${error && error.code ? error.code : 'transition error'}`);
      break;
    }
    const generated = replayed.rounds[replayed.rounds.length - 1];
    for (const key of ['round', 'choices', 'commitments', 'events', 'changes', 'edgesAfter', 'streakAfter', 'beaconsAfter', 'result']) {
      if (!same(generated[key], source[key])) issues.push(`round ${i + 1}: ${key}`);
    }
    if (replayed.result && i !== state.rounds.length - 1) {
      issues.push(`round ${i + 1}: rounds after terminal result`); break;
    }
  }
  for (const key of ['edges', 'streak', 'result', 'seen']) {
    if (!same(replayed[key], state[key])) issues.push(`final: ${key}`);
  }
  if (replayed.rounds.length !== state.rounds.length) issues.push('final: round count');
  return { ok: issues.length === 0, issues };
}

function createReplay(state) {
  const timeline = buildTimeline(state);
  let position = 0;
  const api = {
    timeline,
    pos: () => position,
    current: () => clone(timeline[position]),
    go(index) { const n = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0; position = Math.max(0, Math.min(timeline.length - 1, n)); return api.current(); },
    first() { return api.go(0); },
    last() { return api.go(timeline.length - 1); },
    prev() { return api.go(position - 1); },
    next() { return api.go(position + 1); },
    get atStart() { return position === 0; },
    get atEnd() { return position === timeline.length - 1; }
  };
  return api;
}
N.replay = { buildTimeline, verify, createReplay };
})(typeof window !== 'undefined' ? window : globalThis);
