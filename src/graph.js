// Graph helpers: validation, canonical edges, undirected connectivity.
(function (G) {
'use strict';
const N = G.NORI, C = N.C;
const isValidNode = n => Number.isInteger(n) && n >= 1 && n <= 10;
const isValidEdge = k => typeof k === 'string' && C.EDGES.includes(k);
const edgeEnds = k => k.split('-').map(Number);
const canonicalEdges = set => C.EDGES.filter(k => set.has(k)); // stable order, never array-iteration luck
function isConnected(edges, from, to) {
  const E = edges instanceof Set ? edges : new Set(edges), seen = new Set([from]), stack = [from];
  while (stack.length) {
    const v = stack.pop();
    if (v === to) return true;
    for (const k of E) { const [a, b] = edgeEnds(k), w = a === v ? b : b === v ? a : 0; if (w && !seen.has(w)) { seen.add(w); stack.push(w); } }
  }
  return false;
}
N.graph = { isValidNode, isValidEdge, edgeEnds, canonicalEdges, isConnected, edgeKey: C.edgeKey };
})(typeof window !== 'undefined' ? window : globalThis);
