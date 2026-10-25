'use strict';
// Small HTTP helpers shared by the API, OAuth and static handlers.
const P = require('./protocol.js');
const MAX_BODY = 262144;   // JSON API bodies; an avatar data URL is at most ~200 KB
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const SECURITY_HEADERS = Object.freeze({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP, 'X-Frame-Options': 'DENY' });
const withSecurity = h => Object.assign({}, h, SECURITY_HEADERS);

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, withSecurity({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) }));
  res.end(body);
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function sendHtml(res, status, title, message) {
  const body = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><body style="font:16px system-ui;background:#0a0d13;color:#edf3ff;padding:32px;max-width:720px;margin:auto"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a style="color:#79b8ff" href="/">Вернуться в NORI</a></p></body></html>`;
  res.writeHead(status, withSecurity({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })); res.end(body);
}
function redirect(res, location) { res.writeHead(302, withSecurity({ Location: location, 'Cache-Control': 'no-store' })); res.end(); }
// Reads a JSON body (at most MAX_BODY bytes) and calls handler(body); handler may be async. Errors become 4xx/500 JSON.
function readJson(req, res, handler) {
  const tooLarge = () => { res.on('finish', () => req.destroy()); sendJson(res, 413, { ok: false, code: 'BODY_TOO_LARGE' }); };
  if (Number(req.headers['content-length']) > MAX_BODY) return tooLarge();
  const chunks = []; let size = 0, refused = false;
  req.on('data', chunk => { if (refused) return; size += chunk.length; if (size > MAX_BODY) { refused = true; tooLarge(); return; } chunks.push(chunk); });
  req.on('end', () => {
    if (refused) return; let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (_) { return sendJson(res, 400, { ok: false, code: 'BAD_JSON' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res, 400, { ok: false, code: 'BAD_JSON' });
    Promise.resolve().then(() => handler(body)).catch(() => { if (!res.headersSent) sendJson(res, 500, { ok: false, code: 'INTERNAL' }); });
  });
}
const bearer = req => { const auth = String(req.headers.authorization || ''); return auth.startsWith('Bearer ') ? auth.slice(7) : ''; };
// Per-client-IP sliding-window limiter. Behind a reverse proxy pass trustProxy so X-Forwarded-For is used.
function createIpLimiter({ max, windowMs, trustProxy }) {
  const byIp = new Map();
  const ipOf = req => (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
  return {
    allow(req) { const ip = ipOf(req); let e = byIp.get(ip); if (!e) { e = { limiter: P.createLimiter({ max, windowMs }), last: 0 }; byIp.set(ip, e); } e.last = Date.now(); return e.limiter.allow(); },
    sweep() { const t = Date.now(); for (const [ip, e] of byIp) if (t - e.last > windowMs) byIp.delete(ip); },
    get size() { return byIp.size; }
  };
}
module.exports = { MAX_BODY, CSP, SECURITY_HEADERS, withSecurity, sendJson, sendHtml, redirect, readJson, bearer, createIpLimiter };
