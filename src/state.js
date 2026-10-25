// Immutable game state: initial state, round step, terminal result, replay, undo.
(function (G) {
'use strict';
const N = G.NORI, C = N.C, R = N.rules;
const clone = o => JSON.parse(JSON.stringify(o));
function createInitialState() {
  const s = { version: C.SCHEMA, round: 1, edges: C.RING.slice(), streak: [0, 0], seen: {}, rounds: [], result: null };
  s.seen[R.makeStateKey(s)] = 1;
  return s;
}
function result(type, winner, code, loser) { return { type, winner, loser, code, reason: code.toLowerCase() }; }
// Core transition shared by the game and the AI. Priority: simultaneous Signal Break, single Signal Break, then repetition.
function stepCore(edges, streak, seen, choices) {
  const r = R.resolveRoundChoices(edges, choices);
  const ns = C.PLAYERS.map((P, i) => (R.isBroken(r.edges, i) ? streak[i] + 1 : 0));
  const lost = ns.map(x => x >= C.STREAK_TARGET);
  let res = null, seenKey = null, count = 0;
  if (lost[0] && lost[1]) res = result('draw', null, 'SIMULTANEOUS_SIGNAL_BREAK', null);
  else if (lost[0] || lost[1]) res = result('win', lost[0] ? 1 : 0, 'SIGNAL_BREAK', lost[0] ? 0 : 1);
  else { seenKey = R.makeKey(r.edges, ns); count = (seen[seenKey] || 0) + 1; if (count >= C.REPEAT_TARGET) res = result('draw', null, 'THREEFOLD_REPETITION', null); }
  return { resolved: r, streak: ns, result: res, seenKey, seenCount: count };
}
function playRound(state, choices) {
  if (state.result) throw R.fail('GAME_OVER');
  const s = stepCore(state.edges, state.streak, state.seen, choices), seen = Object.assign({}, state.seen);
  if (s.seenKey) seen[s.seenKey] = s.seenCount;
  const rec = { round: state.round, choices: clone(choices), commitments: choices.map(c => R.getCommitment(c).committed), events: s.resolved.events, changes: s.resolved.changes,
    edgesAfter: s.resolved.edges.slice(), streakAfter: s.streak.slice(), beaconsAfter: [0, 1].map(p => R.getBeaconStatus(s.resolved.edges, p)), result: s.result };
  return { version: state.version, round: state.round + 1, edges: s.resolved.edges, streak: s.streak, seen, rounds: state.rounds.concat([rec]), result: s.result };
}
// Terminal result derived from a state alone (same priorities as stepCore).
function getTerminalResult(st) {
  const lost = st.streak.map(x => x >= C.STREAK_TARGET);
  if (lost[0] && lost[1]) return result('draw', null, 'SIMULTANEOUS_SIGNAL_BREAK', null);
  if (lost[0] || lost[1]) return result('win', lost[0] ? 1 : 0, 'SIGNAL_BREAK', lost[0] ? 0 : 1);
  if ((st.seen[R.makeStateKey(st)] || 0) >= C.REPEAT_TARGET) return result('draw', null, 'THREEFOLD_REPETITION', null);
  return null;
}
function replayRounds(list) { return list.reduce((s, ch) => playRound(s, ch), createInitialState()); }
// Undo = deterministic replay of all rounds but the last: exact edges, streak, seen, journal, result.
function undoRound(state) { if (!state.rounds.length) return state; return replayRounds(state.rounds.slice(0, -1).map(r => r.choices)); }
N.state = { createInitialState, cloneState: clone, stepCore, playRound, getTerminalResult, replayRounds, undoRound };
})(typeof window !== 'undefined' ? window : globalThis);
