'use strict';
// Reference opponents for empirical NORI AI evaluation. These are intentionally
// different baselines, not claims about human styles or optimal play.
function hash32(value) {
  let h = 2166136261;
  for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mix32(x) {
  x = (x + 0x6D2B79F5) >>> 0;
  let t = x;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}
function plain(c) { return { node: c.node, action: c.action, edge: c.edge }; }
function connected(edges, N, player) { return N.rules.getBeaconStatus(edges, player).filter(Boolean).length; }
function noopFor(state, edge, N) {
  const desiredAction = state.edges.includes(edge) ? 'CREATE' : 'CUT';
  return N.ai.ABSTRACT.find(c => c.edge !== edge && c.action === desiredAction);
}
function afterSoloChoice(state, player, choice, N) {
  const noop = noopFor(state, choice.edge, N);
  if (!noop) throw new Error('Could not construct a no-op reference choice');
  const pair = player === 0 ? [plain(choice), plain(noop)] : [plain(noop), plain(choice)];
  return N.state.stepCore(state.edges, state.streak, state.seen, pair);
}
function scoreOneStep(state, player, choice, kind, N) {
  const out = afterSoloChoice(state, player, choice, N);
  const result = out.result;
  if (result && result.type === 'win') return result.winner === player ? 10000 : -10000;
  const beforeOwn = connected(state.edges, N, player), afterOwn = connected(out.resolved.edges, N, player);
  const beforeOpp = connected(state.edges, N, 1 - player), afterOpp = connected(out.resolved.edges, N, 1 - player);
  const ownDelta = afterOwn - beforeOwn, oppDamage = beforeOpp - afterOpp;
  const pos = (N.ai.positionScore(out.resolved.edges, out.streak) || 0) * (player === 0 ? 1 : -1);
  if (kind === 'aggressive') {
    // Prefer immediate disruption to the opponent; own network quality is secondary.
    return 13 * oppDamage + 3 * ownDelta + 0.08 * pos - (result && result.type === 'draw' ? 1 : 0);
  }
  // Defensive reference: preserve connected beacons and route quality, with strong penalty
  // for causing one's own Signal Break streak to continue.
  const ownBroken = N.rules.isBroken(out.resolved.edges, player);
  const streakPenalty = ownBroken ? (state.streak[player] > 0 ? 30 : 5) : 0;
  return 13 * ownDelta + 2 * oppDamage + 0.22 * pos - streakPenalty;
}
function createOpponentSet(N) {
  const descriptions = {
    random: 'Uniformly random legal abstract choice; deterministic for repeatability.',
    aggressive: 'Greedy one-step opponent disruption; accepts some self-risk.',
    defensive: 'Greedy one-step preservation of own beacons and route quality.',
    tactical: 'Unprofiled maximin engine; evaluates the full 56×56 simultaneous-response matrix.'
  };
  function choose(name, state, player, context = {}) {
    if (name === 'tactical') return N.ai.chooseAIAction(state, player);
    const choices = N.ai.ABSTRACT;
    if (name === 'random') {
      const seed = (Number(context.seed) || 0) ^ Math.imul(state.round, 0x9e3779b1) ^ Math.imul(player + 1, 0x85ebca6b) ^ hash32(N.rules.makeFullKey(state));
      return plain(choices[mix32(seed) % choices.length]);
    }
    if (name !== 'aggressive' && name !== 'defensive') throw new Error('Unknown archetype: ' + name);
    let best = -Infinity, bestMoves = [];
    for (const choice of choices) {
      const score = scoreOneStep(state, player, choice, name, N);
      if (score > best + 1e-9) { best = score; bestMoves = [choice]; }
      else if (Math.abs(score - best) <= 1e-9) bestMoves.push(choice);
    }
    const salt = (Number(context.seed) || 0) ^ Math.imul(state.round, 0x27d4eb2d) ^ (player + 1);
    return plain(bestMoves[mix32(salt) % bestMoves.length]);
  }
  return { names: Object.keys(descriptions), descriptions, choose };
}
module.exports = { createOpponentSet, hash32, mix32 };
