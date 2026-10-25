// NORI V0.0.6 constants. Rules are frozen: do not change without explicit approval.
(function (G) {
'use strict';
const N = G.NORI = G.NORI || {};
const edgeKey = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
const pairs = l => l.map(p => edgeKey(p[0], p[1]));
const RING = pairs([[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,1]]);
const CHORDS = pairs([[2,7],[3,8],[4,9],[5,10]]);
N.C = Object.freeze({
  VERSION: '0.0.6', APP_VERSION: '0.2.7', SCHEMA: 1,   // VERSION = frozen rules version (also in saves/exports); APP_VERSION = UI release
  NODES: Object.freeze([1,2,3,4,5,6,7,8,9,10]),
  RING: Object.freeze(RING), CHORDS: Object.freeze(CHORDS), EDGES: Object.freeze(RING.concat(CHORDS)),
  PLAYERS: Object.freeze([
    Object.freeze({ id: 0, key: 'white', source: 1, beacons: Object.freeze([4, 7]) }),
    Object.freeze({ id: 1, key: 'black', source: 6, beacons: Object.freeze([9, 2]) })]),
  ACTIONS: Object.freeze(['CREATE', 'CUT']),
  STREAK_TARGET: 2, REPEAT_TARGET: 3,
  rot180: n => ((n + 4) % 10) + 1, // 1<->6, 2<->7, 3<->8, 4<->9, 5<->10
  edgeKey
});
})(typeof window !== 'undefined' ? window : globalThis);
