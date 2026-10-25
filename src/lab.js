// NORI LAB: a deliberately artificial sandbox isolated from official games and rating.
(function (G) {
'use strict';
const N = G.NORI, C = N.C, R = N.rules, graph = N.graph;
const canonical = edges => graph.canonicalEdges(new Set(edges));
const clone = value => JSON.parse(JSON.stringify(value));
const bad = code => ({ ok: false, code });

function createLab(seed) {
  const edges = seed && Array.isArray(seed.edges) ? seed.edges.slice() : C.RING.slice();
  const seen = new Set();
  for (const edge of edges) {
    if (!graph.isValidEdge(edge)) throw R.fail('INVALID_EDGE', String(edge));
    if (seen.has(edge)) throw R.fail('DUPLICATE_EDGE', edge);
    seen.add(edge);
  }
  const streak = seed && Array.isArray(seed.streak) ? seed.streak.slice() : [0, 0];
  if (streak.length !== 2 || !streak.every(v => v === 0 || v === 1)) throw R.fail('INVALID_STREAK');
  const baseEdges = canonical(seen);
  return { edges: baseEdges.slice(), streak, base: { edges: baseEdges.slice(), streak: streak.slice() }, steps: 0, artificial: true, name: String(seed && seed.name || '').slice(0, 100), lastResult: null };
}
function toggleEdge(lab, key) {
  if (!lab || !graph.isValidEdge(key)) throw R.fail('INVALID_EDGE', String(key));
  if (lab.lastResult) lab.streak = lab.streak.map(value => Math.min(value, C.STREAK_TARGET - 1));
  const set = new Set(lab.edges); if (set.has(key)) set.delete(key); else set.add(key);
  lab.edges = graph.canonicalEdges(set); lab.steps++; lab.artificial = true; lab.lastResult = null; return lab;
}
function setStreak(lab, player, value) {
  if (!lab || (player !== 0 && player !== 1) || (value !== 0 && value !== 1)) throw R.fail('INVALID_STREAK');
  if (lab.lastResult) lab.streak = lab.streak.map(current => Math.min(current, C.STREAK_TARGET - 1));
  lab.streak[player] = value; lab.steps++; lab.artificial = true; lab.lastResult = null; return lab;
}
function getPosition(lab) {
  return { edges: lab.edges.slice(), streak: lab.streak.slice(), beacons: [0, 1].map(p => R.getBeaconStatus(lab.edges, p)), broken: [0, 1].map(p => R.isBroken(lab.edges, p)), result: lab.lastResult };
}
function tryActions(lab, choices) {
  if (!lab || lab.lastResult) throw R.fail('LAB_TERMINAL');
  const resolved = R.resolveRoundChoices(lab.edges, choices);
  const nextStreak = C.PLAYERS.map((_, p) => R.isBroken(resolved.edges, p) ? lab.streak[p] + 1 : 0);
  const lost = nextStreak.map(x => x >= C.STREAK_TARGET);
  let result = null;
  if (lost[0] && lost[1]) result = { type: 'draw', winner: null, code: 'SIMULTANEOUS_SIGNAL_BREAK' };
  else if (lost[0] || lost[1]) result = { type: 'win', winner: lost[0] ? 1 : 0, code: 'SIGNAL_BREAK' };
  return Object.assign({}, resolved, { streak: nextStreak, result, artificial: true, note: 'Repetition history is not modelled in NORI LAB.' });
}
function applyActions(lab, choices) {
  const preview = tryActions(lab, choices);
  lab.edges = preview.edges.slice(); lab.streak = preview.streak.map(x => Math.min(x, C.STREAK_TARGET));
  lab.steps++; lab.artificial = true; lab.lastResult = preview.result ? clone(preview.result) : null;
  return preview;
}
function reset(lab) {
  lab.edges = lab.base.edges.slice(); lab.streak = lab.base.streak.slice(); lab.steps = 0; lab.artificial = true; lab.lastResult = null; return lab;
}
function compare(lab) {
  const base = new Set(lab.base.edges), current = new Set(lab.edges);
  return C.EDGES.filter(edge => base.has(edge) !== current.has(edge)).map(edge => ({ edge, before: base.has(edge), after: current.has(edge) }));
}
function networkMap(edges) {
  const active = canonical(edges);
  return C.PLAYERS.map((P, player) => ({ player,
    beacons: P.beacons.map(node => ({ node, connected: graph.isConnected(active, node, P.source) })),
    vital: active.filter(edge => {
      const remaining = active.filter(other => other !== edge);
      return P.beacons.some(node => graph.isConnected(active, node, P.source) && !graph.isConnected(remaining, node, P.source));
    })
  }));
}
function exportScenario(lab, meta) {
  if (!lab || lab.lastResult || lab.streak.some(value => value < 0 || value >= C.STREAK_TARGET)) throw R.fail('LAB_TERMINAL');
  meta = meta || {};
  return JSON.stringify({ game: 'NORI-SCENARIO', schema: C.SCHEMA, version: C.VERSION, kind: 'scenario',
    name: String(meta.name || lab.name || '').slice(0, 100), author: String(meta.author || '').slice(0, 60),
    date: new Date().toISOString(), edges: lab.edges.slice(), streak: lab.streak.slice(), history: 'artificial' }, null, 2);
}
function importScenario(text) {
  if (typeof text !== 'string' || text.length > 200000) return bad('TOO_BIG');
  let data; try { data = JSON.parse(text); } catch (_) { return bad('PARSE'); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.game !== 'NORI-SCENARIO' || data.schema !== C.SCHEMA || data.version !== C.VERSION || data.kind !== 'scenario') return bad('VERSION');
  if (!Array.isArray(data.edges)) return bad('INVALID');
  const seen = new Set();
  for (const edge of data.edges) { if (!graph.isValidEdge(edge)) return bad('INVALID_EDGE'); if (seen.has(edge)) return bad('DUPLICATE_EDGE'); seen.add(edge); }
  if (!Array.isArray(data.streak) || data.streak.length !== 2 || !data.streak.every(v => v === 0 || v === 1)) return bad('INVALID_STREAK');
  try { return { ok: true, lab: createLab({ edges: canonical(seen), streak: data.streak, name: data.name }) }; }
  catch (_) { return bad('INVALID'); }
}
N.lab = { createLab, toggleEdge, setStreak, getPosition, tryActions, applyActions, reset, compare, networkMap, exportScenario, importScenario };
})(typeof window !== 'undefined' ? window : globalThis);
