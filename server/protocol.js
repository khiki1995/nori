'use strict';
// NORI online protocol v1: message limits, strict parsing of client messages, small rate limiter.
const VERSION = 1, MAX_BYTES = 16384;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I, O, 0, 1
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/, TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
// Allowed fields per client message type (anything else is rejected).
const SCHEMAS = { create_room: [], join_room: ['code'], resume_room: ['code', 'token'], submit_choice: ['round', 'choice'], request_snapshot: [] };
// Optional fields: `auth` = account session token, so a finished game between two signed-in players is rated.
const OPTIONAL = { create_room: ['auth'], join_room: ['auth'] }, AUTH_RE = /^[A-Za-z0-9_-]{16,200}$/;
const isPlain = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const normalizeCode = s => (typeof s === 'string' ? s.trim().toUpperCase() : '');
const keysOk = (o, allowed) => Object.keys(o).every(k => allowed.includes(k)) && allowed.every(k => k in o);

function parse(raw) {
  if (typeof raw !== 'string') return { ok: false, code: 'INVALID_MESSAGE' };
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) return { ok: false, code: 'TOO_LARGE' };
  let msg; try { msg = JSON.parse(raw); } catch (e) { return { ok: false, code: 'BAD_JSON' }; }
  if (!isPlain(msg) || msg.v !== VERSION || typeof msg.type !== 'string') return { ok: false, code: 'INVALID_MESSAGE' };
  if (!Object.prototype.hasOwnProperty.call(SCHEMAS, msg.type)) return { ok: false, code: 'UNKNOWN_TYPE' };
  const extra = Object.keys(msg).filter(k => k !== 'v' && k !== 'type');   // own keys only; an own "__proto__" key from JSON.parse is rejected here
  const req = SCHEMAS[msg.type], opt = OPTIONAL[msg.type] || [];
  if (!req.every(k => extra.includes(k)) || !extra.every(k => req.includes(k) || opt.includes(k))) return { ok: false, code: 'INVALID_MESSAGE' };
  if ('auth' in msg && !(typeof msg.auth === 'string' && AUTH_RE.test(msg.auth))) return { ok: false, code: 'INVALID_MESSAGE' };
  if (msg.type === 'join_room' || msg.type === 'resume_room') { msg.code = normalizeCode(msg.code); if (!CODE_RE.test(msg.code)) return { ok: false, code: 'BAD_CODE' }; }
  if (msg.type === 'resume_room' && !(typeof msg.token === 'string' && TOKEN_RE.test(msg.token))) return { ok: false, code: 'BAD_TOKEN' };
  if (msg.type === 'submit_choice') {
    const c = msg.choice;
    if (!Number.isInteger(msg.round) || msg.round < 1 || !isPlain(c) || !keysOk(c, ['node', 'action', 'edge']) || !Number.isInteger(c.node) || typeof c.action !== 'string' || typeof c.edge !== 'string') return { ok: false, code: 'INVALID_MESSAGE' };
  }
  return { ok: true, msg };
}
// At most `max` events per `windowMs` (sliding window).
function createLimiter({ max, windowMs, now = Date.now }) {
  let stamps = [];
  return { allow() { const t = now(); stamps = stamps.filter(s => t - s < windowMs); if (stamps.length >= max) return false; stamps.push(t); return true; } };
}
module.exports = { VERSION, MAX_BYTES, CODE_ALPHABET, CODE_RE, TOKEN_RE, SCHEMAS, OPTIONAL, normalizeCode, parse, createLimiter };
