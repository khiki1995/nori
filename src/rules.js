// Pure rules: choice validation, commitment, simultaneous resolution, beacon status, state keys.
(function (G) {
'use strict';
const N = G.NORI, C = N.C, g = N.graph;
const fail = (code, detail) => { const e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; return e; };
function validateChoice(c) {
  if (!c || typeof c !== 'object') throw fail('INVALID_CHOICE');
  if (!g.isValidNode(c.node)) throw fail('INVALID_NODE', String(c.node));
  if (!C.ACTIONS.includes(c.action)) throw fail('INVALID_ACTION', String(c.action));
  if (!g.isValidEdge(c.edge)) throw fail('INVALID_EDGE', String(c.edge));
  return c;
}
// Committed iff the target edge is incident to the intention node. Computed, never chosen.
function getCommitment(c) { validateChoice(c); const ends = g.edgeEnds(c.edge); return { committed: ends.includes(c.node), ends }; }

// Resolve both choices at once on the given edge set. Returns canonical edges + structured events (no text).
function resolveRoundChoices(edges, choices) {
  if (!Array.isArray(choices) || choices.length !== 2) throw fail('INVALID_CHOICES');
  const [w, b] = choices, cm = [getCommitment(w).committed, getCommitment(b).committed];
  const set = new Set(edges), before = new Set(edges), events = [];
  const apply = c => { const had = set.has(c.edge); if (c.action === 'CREATE') set.add(c.edge); else set.delete(c.edge); return had !== set.has(c.edge); };
  if (w.edge !== b.edge) {
    [0, 1].forEach(i => events.push({ kind: 'apply', player: i, edge: choices[i].edge, action: choices[i].action, committed: cm[i], changed: apply(choices[i]) }));
  } else if (w.action === b.action) {
    events.push({ kind: 'merged', edge: w.edge, action: w.action, committed: cm.slice(), changed: apply(w) });
  } else if (cm[0] !== cm[1]) {
    const i = cm[0] ? 0 : 1;
    events.push({ kind: 'override', winner: i, edge: w.edge, action: choices[i].action, committed: cm.slice(), changed: apply(choices[i]) });
  } else {
    events.push({ kind: 'conflict', edge: w.edge, committed: cm.slice(), changed: false });
  }
  const out = g.canonicalEdges(set);
  const changes = C.EDGES.filter(k => before.has(k) !== set.has(k)).map(k => ({ edge: k, before: before.has(k), after: set.has(k) }));
  return { edges: out, events, changes };
}
const getBeaconStatus = (edges, p) => C.PLAYERS[p].beacons.map(bn => g.isConnected(edges, bn, C.PLAYERS[p].source));
const isBroken = (edges, p) => getBeaconStatus(edges, p).every(ok => !ok);
// Repetition key: 14-bit active-edge mask + both Signal Break streaks.
const makeKey = (edges, streak) => { const s = new Set(edges); return C.EDGES.map(k => (s.has(k) ? 1 : 0)).join('') + '|' + streak.join(','); };
const makeStateKey = st => makeKey(st.edges, st.streak);
// Full history key for caching/analysis: state key + the whole canonical seen map.
const makeFullKey = st => makeStateKey(st) + '#' + Object.keys(st.seen).sort().map(k => k + '=' + st.seen[k]).join(';');
N.rules = { fail, validateChoice, getCommitment, resolveRoundChoices, getBeaconStatus, isBroken, makeKey, makeStateKey, makeFullKey };
})(typeof window !== 'undefined' ? window : globalThis);
