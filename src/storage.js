// Persistence: localStorage save/load, JSON export/import with strict validation. Hidden pending choices are never saved or exported.
(function (G) {
'use strict';
const N = G.NORI, C = N.C, R = N.rules, S = N.state;
const KEY = 'nori.save.v1', MAX_CHARS = 300000, MAX_ROUNDS = 1000;
const sameArr = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function exportHistory(session) {
  const st = session.state;
  return JSON.stringify({ game: 'NORI', schema: C.SCHEMA, version: C.VERSION, mode: session.mode, botId: session.botId || null,
    rounds: st.rounds.map(r => ({ choices: r.choices })),
    final: { edges: st.edges, streak: st.streak, result: st.result ? { type: st.result.type, winner: st.result.winner, code: st.result.code } : null } }, null, 1);
}
const bad = (code, round) => ({ ok: false, code, round: round || 0 });
// Returns {ok:true, session} or {ok:false, code, round}. Never throws; never touches existing sessions.
function importHistory(text) {
  if (typeof text !== 'string' || text.length > MAX_CHARS) return bad('TOO_BIG');
  let d; try { d = JSON.parse(text); } catch (e) { return bad('PARSE'); }
  if (!d || typeof d !== 'object' || d.game !== 'NORI' || d.schema !== C.SCHEMA) return bad('VERSION');
  if (!['hvh', 'ai'].includes(d.mode) || !Array.isArray(d.rounds) || d.rounds.length > MAX_ROUNDS) return bad('INVALID');
  let st = S.createInitialState();
  for (let i = 0; i < d.rounds.length; i++) {
    const ch = d.rounds[i] && d.rounds[i].choices;
    if (!Array.isArray(ch) || ch.length !== 2) return bad('INVALID', i + 1);
    try { ch.forEach(R.validateChoice); st = S.playRound(st, ch.map(c => ({ node: c.node, action: c.action, edge: c.edge }))); } catch (e) { return bad('INVALID', i + 1); }
  }
  if (d.final) {
    const f = d.final, r = st.result;
    const okRes = f.result === null ? r === null : !!r && !!f.result && f.result.type === r.type && f.result.winner === r.winner && f.result.code === r.code;
    if (!sameArr(f.edges, st.edges) || !sameArr(f.streak, st.streak) || !okRes) return bad('INVALID', d.rounds.length);
  }
  return { ok: true, session: N.controller.sessionFromState(d.mode, st, typeof d.botId === 'string' ? d.botId : null) };
}
function saveSession(session, storage) { try { storage.setItem(KEY, exportHistory(session)); return { ok: true }; } catch (e) { return { ok: false, code: 'STORAGE' }; } }
function loadSession(storage) {
  let raw; try { raw = storage.getItem(KEY); } catch (e) { return { ok: false, code: 'STORAGE' }; }
  return raw === null || raw === undefined ? { ok: false, code: 'EMPTY' } : importHistory(raw);
}
N.storage = { KEY, exportHistory, importHistory, saveSession, loadSession };
})(typeof window !== 'undefined' ? window : globalThis);
