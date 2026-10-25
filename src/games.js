// Local archive of finished games. Online games are intentionally not archived here.
(function (G) {
'use strict';
const N = G.NORI, St = N.storage;
const KEY = 'nori.games.v1', MAX = 50;
function read(storage) {
  if (!storage || typeof storage.getItem !== 'function') return [];
  try {
    const data = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(data) ? data.filter(x => x && typeof x.id === 'string' && typeof x.date === 'string' && typeof x.data === 'string').slice(-MAX) : [];
  } catch (_) { return []; }
}
function write(storage, entries) {
  try { if (!storage || typeof storage.setItem !== 'function') return false; storage.setItem(KEY, JSON.stringify(entries.slice(-MAX))); return true; }
  catch (_) { return false; }
}
function recordFinished(session, storage) {
  if (!session || !session.state || !session.state.result || !['hvh', 'ai'].includes(session.mode)) return { ok: false, code: 'NOT_FINISHED' };
  if (session.__noriArchived) return { ok: true, duplicate: true };
  if (!storage) return { ok: false, code: 'STORAGE' };
  let data;
  try { data = St.exportHistory(session); } catch (_) { return { ok: false, code: 'INVALID_GAME' }; }
  const entries = read(storage);
  // Idempotence per session object; two separately played identical games may both be archived.
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  entries.push({ id, date: new Date().toISOString(), data });
  const ok = write(storage, entries); if (ok) session.__noriArchived = true;
  return { ok, id };
}
function list(storage) {
  return read(storage).slice().reverse().map(entry => {
    const imported = St.importHistory(entry.data);
    if (!imported.ok || !imported.session.state.result) return null;
    const session = imported.session;
    return { id: entry.id, date: entry.date, mode: session.mode, rounds: session.state.rounds.length, result: session.state.result };
  }).filter(Boolean);
}
function load(storage, id) {
  const entry = read(storage).find(x => x.id === id);
  if (!entry) return { ok: false, code: 'NOT_FOUND' };
  const imported = St.importHistory(entry.data);
  if (!imported.ok || !imported.session.state.result) return { ok: false, code: 'INVALID_GAME' };
  return Object.assign({}, imported, { entry: { id: entry.id, date: entry.date } });
}
function remove(storage, id) { return { ok: write(storage, read(storage).filter(x => x.id !== id)) }; }
function clear(storage) { return { ok: write(storage, []) }; }
N.games = { KEY, MAX, recordFinished, list, load, remove, clear };
})(typeof window !== 'undefined' ? window : globalThis);
