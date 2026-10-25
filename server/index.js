'use strict';
// NORI online server: static files + /health + WebSocket (/ws) on one origin. In-memory rooms only (lost on restart).
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws'), P = require('./protocol.js'), { RoomManager } = require('./rooms.js');
const { createAccountStore } = require('./accounts.js'), { createApiRoutes } = require('./api.js'), { createGoogleAuth } = require('./oauth.js');
const { ROOT, staticPath, serveStatic } = require('./static.js'), { sendJson, withSecurity, createIpLimiter } = require('./http.js');
// Optional private .env file for local OAuth configuration. The file is never served to browsers.
(function loadLocalEnv() {
  const file = path.join(ROOT, '.env'); let content = '';
  try { content = fs.readFileSync(file, 'utf8'); } catch (_) { return; }
  content.split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (!m || process.env[m[1]] !== undefined) return;
    let value = m[2]; if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[m[1]] = value;
  });
})();
function createGameServer(opts = {}) {
  const log = opts.log || (() => {}), allowed = (opts.allowedOrigins || (process.env.ALLOWED_ORIGINS || '').split(',')).map(s => s.trim()).filter(Boolean);
  const accounts = opts.accounts || createAccountStore({ file: process.env.NORI_ACCOUNTS_FILE || path.join(ROOT, 'data', 'accounts.json') });
  // Rooms know players only by account id; a finished game between two different accounts is rated.
  const manager = new RoomManager(Object.assign({ identify: token => accounts.userIdForToken(token), onRated: (idA, idB, scoreA) => accounts.recordRatedResultByIds(idA, idB, scoreA) }, opts.manager || {}));
  const maxConnections = opts.maxConnections || 1000;
  // Per-IP limit for password checks and game replays (brute force / CPU exhaustion). Behind a proxy set TRUST_PROXY=1.
  const authLimiter = createIpLimiter({ max: opts.authRateMax || 10, windowMs: opts.authRateWindowMs || 60000, trustProxy: opts.trustProxy !== undefined ? opts.trustProxy : process.env.TRUST_PROXY === '1' });
  const google = createGoogleAuth({ accounts, maxPending: opts.maxOauthPending, log });
  const routes = Object.assign({}, createApiRoutes({ accounts, authLimiter }), google.routes);
  const sweepAuth = () => { google.sweep(); authLimiter.sweep(); };
  const server = http.createServer((req, res) => {
    const pathname = (req.url || '/').split('?')[0], route = routes[req.method + ' ' + pathname];
    if (route) return route(req, res);
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, code: 'NOT_FOUND' });
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, withSecurity({ Allow: 'GET, HEAD' })); return res.end(); }
    if (pathname === '/health') { const b = JSON.stringify({ ok: true }); res.writeHead(200, withSecurity({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(b) })); return res.end(req.method === 'HEAD' ? undefined : b); }
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: P.MAX_BYTES });
  const originOk = req => { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host || allowed.includes(o); } catch (e) { return false; } };
  server.on('upgrade', (req, socket, head) => {
    const deny = code => { socket.write(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
    if ((req.url || '').split('?')[0] !== '/ws') return deny('404 Not Found');
    if (!originOk(req)) return deny('403 Forbidden');
    if (wss.clients.size >= maxConnections) { log('ws: connection refused, limit', maxConnections, 'reached'); return deny('503 Service Unavailable'); }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', ws => {
    const conn = { seat: null, send(o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }, close(code, reason) { ws.close(code, reason); } };
    const limiter = P.createLimiter({ max: opts.rateMax || 30, windowMs: opts.rateWindowMs || 10000 }); let strikes = 0; ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const idle = setTimeout(() => { if (!conn.seat) ws.close(4003, 'idle'); }, opts.idleMs || 30000); idle.unref();
    ws.on('message', (data, isBinary) => {
      if (isBinary) return manager.error(conn, 'INVALID_MESSAGE');
      if (!limiter.allow()) { manager.error(conn, 'RATE_LIMITED'); if (++strikes > 10) ws.close(1008, 'rate'); return; }
      const parsed = P.parse(data.toString('utf8')); if (!parsed.ok) return manager.error(conn, parsed.code);
      manager.handle(conn, parsed.msg);
    });
    ws.on('close', () => { clearTimeout(idle); manager.disconnect(conn); });
    ws.on('error', () => {});
  });
  const hb = setInterval(() => { wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (e) { /* ignore */ } }); }, opts.heartbeatMs || 25000); hb.unref();
  const sw = setInterval(() => { manager.sweep(); sweepAuth(); }, opts.sweepMs || 60000); sw.unref();
  return {
    server, wss, manager, accounts, sweepAuth, get oauthPending() { return google.pending; },
    listen(port, host) { return new Promise((res, rej) => { server.once('error', rej); server.listen(port, host, () => res(server.address().port)); }); },
    close() { clearInterval(hb); clearInterval(sw); try { if (accounts.flush) accounts.flush(); } catch (e) { console.error('accounts: final write failed:', e.code || e.message); } wss.clients.forEach(ws => ws.terminate()); return new Promise(res => { wss.close(() => server.close(() => res())); }); }
  };
}
module.exports = { createGameServer, staticPath };
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000, host = '0.0.0.0', app = createGameServer({ log: console.log });
  app.listen(port, host).then(p => console.log(`NORI server listening on http://${host}:${p} (in-memory rooms, reset on restart)`)).catch(e => { console.error('Cannot start server:', e.code || e.message); process.exit(1); });
  const stop = () => app.close().then(() => process.exit(0)); process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
