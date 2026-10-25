// Game session controller: phases, hot-seat hiding, AI mode, undo. No DOM. Pending (hidden) choices never leave this module except via finishRound.
(function (G) {
'use strict';
const N = G.NORI, R = N.rules, S = N.state;
const plain = c => ({ node: c.node, action: c.action, edge: c.edge });
function createSession(mode, botId) { return { mode: mode === 'ai' ? 'ai' : 'hvh', botId: typeof botId === 'string' ? botId : null, state: S.createInitialState(), phase: 'pick', turn: 0, pending: [null, null] }; }
function sessionFromState(mode, state, botId) { const s = createSession(mode, botId); s.state = state; s.phase = state.result ? 'over' : 'pick'; return s; }
function finishRound(s) { s.state = S.playRound(s.state, s.pending); s.pending = [null, null]; s.turn = 0; s.phase = s.state.result ? 'over' : 'reveal'; }
function submitChoice(s, choice) {
  if (s.phase !== 'pick') throw R.fail('BAD_PHASE');
  const c = plain(R.validateChoice(choice));
  if (s.mode === 'ai') { s.pending[0] = c; s.pending[1] = N.ai.chooseAIAction(s.state, 1, s.botId); finishRound(s); }
  else if (s.turn === 0) { s.pending[0] = c; s.phase = 'handoff'; }
  else { s.pending[1] = c; finishRound(s); }
  return s;
}
function proceedFromHandoff(s) { if (s.phase !== 'handoff') throw R.fail('BAD_PHASE'); s.phase = 'pick'; s.turn = 1; return s; }
function nextRound(s) { if (s.phase !== 'reveal') throw R.fail('BAD_PHASE'); s.phase = 'pick'; s.turn = 0; return s; }
const canUndo = s => s.state.rounds.length > 0 && (s.phase === 'reveal' || s.phase === 'over' || (s.phase === 'pick' && s.turn === 0));
function undo(s) { if (!canUndo(s)) return false; s.state = S.undoRound(s.state); s.phase = 'pick'; s.turn = 0; s.pending = [null, null]; return true; }
// The only data the UI may read. Hidden choices are exposed as booleans, never as values.
function getPublicView(s) {
  const st = s.state, last = st.rounds.length ? st.rounds[st.rounds.length - 1] : null;
  return { mode: s.mode, phase: s.phase, turn: s.turn, round: st.round, edges: st.edges.slice(), streak: st.streak.slice(),
    beacons: [0, 1].map(p => R.getBeaconStatus(st.edges, p)), rounds: st.rounds, result: st.result,
    hasPending: [!!s.pending[0], !!s.pending[1]], canUndo: canUndo(s), lastRound: (s.phase === 'reveal' || s.phase === 'over') ? last : null };
}
N.controller = { createSession, sessionFromState, submitChoice, proceedFromHandoff, nextRound, undo, canUndo, getPublicView };
})(typeof window !== 'undefined' ? window : globalThis);
