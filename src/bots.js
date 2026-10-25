// Shared bot catalog. Bot profiles are public data; the game engine uses the selected profile's AI tuning.
(function (G) {
'use strict';
const N = G.NORI = G.NORI || {};
let catalog = [], loaded = false, loading = null;
async function load() {
  if (loaded) return catalog;
  if (loading) return loading;
  loading = fetch('/src/bots-data.json', { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error('BOT_CATALOG_UNAVAILABLE');
    return r.json();
  }).then(rows => {
    if (!Array.isArray(rows) || rows.length !== 20) throw new Error('BOT_CATALOG_INVALID');
    catalog = rows.map(x => Object.freeze({ ...x })); loaded = true; return catalog;
  }).finally(() => { loading = null; });
  return loading;
}
function list() { return catalog.slice(); }
function get(id) { return catalog.find(x => x.id === id) || null; }
N.bots = { load, list, get, get loaded() { return loaded; } };
if (G.location && G.location.protocol !== 'file:') load().catch(() => {});
})(typeof window !== 'undefined' ? window : globalThis);
