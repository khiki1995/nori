'use strict';
// Server-side verification of a won local game against a catalog bot. The AI is deterministic for a given
// position and bot profile, so the server replays the game and checks that every Black move is exactly what
// the bot would have played. Only then may the account receive the bot's one-time coin reward.
const path = require('path');
['constants', 'graph', 'rules', 'state', 'ai'].forEach(f => require(path.join(__dirname, '..', 'src', f + '.js')));
const N = globalThis.NORI, { BOT_PROFILES } = require('./accounts.js');
if (!N.bots) N.bots = { get: id => BOT_PROFILES.find(b => b.id === id) || null, list: () => BOT_PROFILES.slice(), loaded: true };
const MAX_REWARD_ROUNDS = 200;
const same = (a, b) => a.node === b.node && a.action === b.action && a.edge === b.edge;

function verifyBotWin(botId, rounds) {
  if (typeof botId !== 'string' || !N.bots.get(botId)) return { ok: false, code: 'UNKNOWN_BOT' };
  if (!Array.isArray(rounds) || rounds.length === 0 || rounds.length > MAX_REWARD_ROUNDS) return { ok: false, code: 'INVALID_GAME' };
  let st = N.state.createInitialState();
  for (let i = 0; i < rounds.length; i++) {
    const pair = rounds[i];
    if (st.result || !Array.isArray(pair) || pair.length !== 2) return { ok: false, code: 'INVALID_GAME', round: i + 1 };
    let choices;
    try { choices = pair.map(c => N.rules.validateChoice({ node: c && c.node, action: c && c.action, edge: c && c.edge })); } catch (_) { return { ok: false, code: 'INVALID_GAME', round: i + 1 }; }
    if (!same(choices[1], N.ai.chooseAIAction(st, 1, botId))) return { ok: false, code: 'NOT_BOT_MOVE', round: i + 1 };
    st = N.state.playRound(st, choices);
  }
  if (!st.result || st.result.type !== 'win' || st.result.winner !== 0) return { ok: false, code: 'NOT_A_WIN' };
  return { ok: true, rounds: rounds.length };
}
module.exports = { verifyBotWin, MAX_REWARD_ROUNDS };
