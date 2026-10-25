// NORI V0.0.6 AI. Rules are unchanged; this file only evaluates choices.
(function (G) {
'use strict';
const N = G.NORI, C = N.C, g = N.graph, R = N.rules;
// 14 edges x 2 actions x 2 commitment classes = 56 abstract choices.
function abstractChoices() {
  const out = [];
  C.EDGES.forEach(edge => C.ACTIONS.forEach(action => [true, false].forEach(committed => {
    const ends = g.edgeEnds(edge), node = committed ? ends[0] : C.NODES.find(n => !ends.includes(n));
    out.push({ node, action, edge, committed });
  })));
  return out;
}
const ABSTRACT = abstractChoices();
const plain = c => ({ node: c.node, action: c.action, edge: c.edge });
const analysisCache = new Map();
const positionCache = new Map();
const MAX_ANALYSIS_CACHE = 64;
const MAX_POSITION_CACHE = 16384; // one entry per possible 14-edge network

function edgeMask(edges) {
  const set = new Set(edges); let mask = 0;
  C.EDGES.forEach((e, i) => { if (set.has(e)) mask |= (1 << i); });
  return mask;
}
function adjacency(edges, omittedEdge = null) {
  const adj = Array.from({ length: 11 }, () => []);
  for (const edge of edges) {
    if (edge === omittedEdge) continue;
    const [a, b] = g.edgeEnds(edge); adj[a].push(b); adj[b].push(a);
  }
  return adj;
}
function bfsDistance(adj, source, target) {
  const dist = Array(11).fill(Infinity), queue = [source]; dist[source] = 0;
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]; if (node === target) return dist[node];
    for (const next of adj[node]) if (!Number.isFinite(dist[next])) { dist[next] = dist[node] + 1; queue.push(next); }
  }
  return Infinity;
}
function beaconQuality(edges, beacon, source, adj) {
  const distance = bfsDistance(adj, source, beacon);
  if (!Number.isFinite(distance)) return -15;
  // Reward routes that are shorter and, especially, cannot be severed by a single cut.
  let singleEdgeVulnerability = false;
  for (const edge of edges) {
    const without = adjacency(edges, edge);
    if (!Number.isFinite(bfsDistance(without, source, beacon))) { singleEdgeVulnerability = true; break; }
  }
  return 8 - 1.25 * (distance - 1) + (singleEdgeVulnerability ? 0 : 4);
}
function positionScore(edges, streak) {
  // Cache only network quality: streaks are applied after lookup, so alternate streaks on
  // the same network reuse the expensive route/redundancy analysis.
  const mask = edgeMask(edges);
  let networkValue = positionCache.get(mask);
  if (networkValue === undefined) {
    const adj = adjacency(edges);
    const quality = player => C.PLAYERS[player].beacons.reduce((sum, beacon) => sum + beaconQuality(edges, beacon, C.PLAYERS[player].source, adj), 0);
    networkValue = quality(0) - quality(1);
    if (positionCache.size >= MAX_POSITION_CACHE) positionCache.clear();
    positionCache.set(mask, networkValue);
  }
  return networkValue + 20 * (streak[1] - streak[0]);
}
function cellValue(next, res, player) {
  if (res && res.type !== 'draw') return res.winner === player ? 1000 : -1000;
  if (res && res.code !== 'THREEFOLD_REPETITION') return 0;
  const advantage = positionScore(next.edges, next.streak) * (player === 0 ? 1 : -1);
  if (res) {
    // A repetition draw is good for the player behind, bad for the player ahead.
    // If the position is exactly level, mildly discourage both players from looping forever.
    return advantage > 0 ? -12 : advantage < 0 ? 12 : -6;
  }
  return advantage;
}
function scoreResolved(state, resolved, player) {
  const next = { edges: resolved.resolved.edges, streak: resolved.streak };
  let value = cellValue(next, resolved.result, player);
  // History-aware anti-cycle evaluation: avoid a repeated level position, but preserve a draw
  // as a resource when the player is behind. This affects AI preferences only, never rule results.
  if (!resolved.result && resolved.seenCount > 0) {
    if (Math.abs(value) < 1e-9) value -= Math.min(24, 8 * resolved.seenCount);
    else value -= Math.sign(value) * Math.min(40, 12 * resolved.seenCount);
  }
  return value;
}
function pairValue(state, pair, player) {
  return scoreResolved(state, N.state.stepCore(state.edges, state.streak, state.seen, pair), player);
}
function analyzeState(state) {
  // Evaluate each simultaneous choice pair once, then retain each player's perspective.
  // Repetition avoidance is intentionally a small shared preference, so both players may
  // prefer a fresh neutral position instead of mechanically accepting a draw by looping.
  const key = R.makeFullKey(state);
  if (analysisCache.has(key)) return analysisCache.get(key);
  const count = ABSTRACT.length;
  const minWhite = Array(count).fill(Infinity), sumWhite = Array(count).fill(0);
  const minBlack = Array(count).fill(Infinity), sumBlack = Array(count).fill(0);
  for (let i = 0; i < count; i++) {
    const white = plain(ABSTRACT[i]);
    for (let j = 0; j < count; j++) {
      const black = plain(ABSTRACT[j]);
      const resolved = N.state.stepCore(state.edges, state.streak, state.seen, [white, black]);
      const vw = scoreResolved(state, resolved, 0), vb = scoreResolved(state, resolved, 1);
      if (vw < minWhite[i]) minWhite[i] = vw;
      sumWhite[i] += vw;
      if (vb < minBlack[j]) minBlack[j] = vb;
      sumBlack[j] += vb;
    }
  }
  const whites = ABSTRACT.map((choice, i) => ({ choice: plain(choice), min: minWhite[i], avg: sumWhite[i] / count }));
  const blacks = ABSTRACT.map((choice, i) => ({ choice: plain(choice), min: minBlack[i], avg: sumBlack[i] / count }));
  const value = [whites, blacks];
  if (analysisCache.size >= MAX_ANALYSIS_CACHE) analysisCache.clear();
  analysisCache.set(key, value);
  return value;
}
function evaluateCandidates(state, player) {
  if (player !== 0 && player !== 1) throw R.fail('INVALID_PLAYER');
  return analyzeState(state)[player].map(c => ({ choice: { ...c.choice }, min: c.min, avg: c.avg }));
}
function cycleBreakBias(state, player, choice) {
  const currentKey = R.makeStateKey(state);
  if (!state.seen || (state.seen[currentKey] || 0) < 2 || !Array.isArray(state.rounds)) return 0;
  let repeats = 0;
  for (let i = 0; i < state.rounds.length - 1; i++) {
    const rec = state.rounds[i];
    if (!rec || !Array.isArray(rec.edgesAfter) || !Array.isArray(rec.streakAfter)) continue;
    if (R.makeKey(rec.edgesAfter, rec.streakAfter) !== currentKey) continue;
    const priorRound = state.rounds[i + 1];
    const prior = priorRound && priorRound.choices && priorRound.choices[player];
    if (prior && prior.node === choice.node && prior.action === choice.action && prior.edge === choice.edge) repeats++;
  }
  return -Math.min(24, repeats * 8);
}

function strategicBias(state, player, choice, profile) {
  if (!profile) return 0;
  const style = String(profile.style || 'balanced');
  const own = R.getBeaconStatus(state.edges, player).filter(Boolean).length;
  const opp = R.getBeaconStatus(state.edges, 1 - player).filter(Boolean).length;
  const ends = g.edgeEnds(choice.edge), isChord = C.CHORDS.includes(choice.edge);
  const present = state.edges.includes(choice.edge);
  const degree = node => C.EDGES.reduce((n, e) => n + (state.edges.includes(e) && g.edgeEnds(e).includes(node) ? 1 : 0), 0);
  const endpointPressure = Math.min(2, degree(ends[0]) + degree(ends[1]));
  let b = 0;
  if (style === 'defensive') b += (own === 0 ? 1.8 : 0.25) * (choice.action === 'CREATE' ? 1 : -0.4);
  if (style === 'aggressive') b += (opp > 0 ? 1.1 : 0.2) * (choice.action === 'CUT' ? 1 : -0.25);
  if (style === 'positional') b += (choice.action === 'CREATE' ? 0.45 : 0) + (isChord ? 0.55 : 0) + endpointPressure * 0.08;
  if (style === 'tactical') b += (choice.action === 'CUT' && opp > 0 ? 0.7 : 0) + (choice.action === 'CREATE' && own === 0 ? 0.7 : 0);
  if (style === 'tricky') b += (isChord ? 0.6 : 0) + (choice.committed === false ? 0.18 : 0);
  if (style === 'reckless' || style === 'chaotic') b += (choice.action === 'CUT' ? 0.3 : 0) + ((choice.node + ends[0] + ends[1]) % 3 === 0 ? 0.24 : 0);
  if (style === 'balanced') b += (choice.action === 'CREATE' && own === 0 ? 0.45 : 0) + (choice.action === 'CUT' && opp > 0 ? 0.45 : 0);
  if (style === 'search') b += (isChord ? 0.25 : 0) + (choice.action === 'CREATE' && !present ? 0.2 : 0);
  const number = Number(profile.number) || 1, edgeIndex = C.EDGES.indexOf(choice.edge);
  if (edgeIndex >= 0 && edgeIndex % 5 === number % 5) b += 0.38;
  if (number % 2 === 0 && choice.action === 'CREATE') b += 0.12;
  return Math.max(-2.5, Math.min(2.5, b));
}
function chooseAIAction(state, player, botId) {
  if (state.result) throw R.fail('GAME_OVER');
  const list = evaluateCandidates(state, player);
  const profile = N.bots && botId ? N.bots.get(botId) : null;
  const avgWeight = profile && Number.isFinite(profile.avgWeight) ? Math.max(0, Math.min(1, profile.avgWeight)) : 0.25;
  const risk = profile && Number.isFinite(profile.risk) ? Math.max(0, Math.min(0.25, profile.risk)) : 0;
  let bestScore = -Infinity, ties = [];
  list.forEach(c => {
    const base = profile ? c.min * (1 - avgWeight) + c.avg * avgWeight + (c.avg - c.min) * risk : c.min * 1000000 + c.avg;
    const score = base + (profile ? strategicBias(state, player, c.choice, profile) : 0) + cycleBreakBias(state, player, c.choice);
    if (score > bestScore + 1e-9) { bestScore = score; ties = [c]; }
    else if (Math.abs(score - bestScore) <= 1e-9) ties.push(c);
  });
  let seed = state.round;
  if (profile) {
    for (const ch of profile.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const scored = list.map(c => ({ ...c, score: c.min * (1 - avgWeight) + c.avg * avgWeight + (c.avg - c.min) * risk + strategicBias(state, player, c.choice, profile) + cycleBreakBias(state, player, c.choice) }));
    const pool = scored.filter(c => c.score >= bestScore - 1.25);
    const hashChoice = c => { let h = seed ^ (c.choice.node * 131) ^ (C.EDGES.indexOf(c.choice.edge) * 977) ^ (c.choice.action === 'CREATE' ? 0x51ed : 0x2f6d) ^ (c.choice.committed ? 0x1234 : 0x4321); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); return (h ^ (h >>> 16)) >>> 0; };
    pool.sort((a,b) => hashChoice(a) - hashChoice(b));
    return pool[0].choice;
  }
  return ties[seed % ties.length].choice;
}
N.ai = { ABSTRACT, evaluateCandidates, chooseAIAction, strategicBias, cycleBreakBias, positionScore, pairValue };
})(typeof window !== 'undefined' ? window : globalThis);
