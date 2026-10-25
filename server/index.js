'use strict';
// NORI online server: static files + /health + WebSocket (/ws) on one origin. In-memory rooms only (lost on restart).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws'), P = require('./protocol.js'), { RoomManager } = require('./rooms.js');
const { createAccountStore } = require('./accounts.js');
const ROOT = path.resolve(__dirname, '..');
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.json': 'application/json; charset=utf-8' };
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
// Only the client files are public: never server/, backups, node_modules or the Python/Node-only test runners.
function staticPath(urlPath) {
  let p; try { p = decodeURIComponent(urlPath.split('?')[0]); } catch (e) { return null; }
  if (p === '/') p = '/index.html';
  if (/[\0\\]|\.\./.test(p)) return null;
  const ok = p.startsWith('/assets/sounds/') && /^\/assets\/sounds\/[A-Za-z0-9._-]+\.wav$/.test(p) || p === '/index.html' || p === '/styles.css' || p === '/manifest.webmanifest' || p === '/src/bots-data.json' || /^\/icons\/[A-Za-z0-9._-]+\.(png|svg)$/.test(p) || /^\/src\/[A-Za-z0-9._-]+\.js$/.test(p) || p === '/tests/harness.js' || /^\/tests\/[A-Za-z0-9._-]+\.test\.js$/.test(p);
  return ok ? path.join(ROOT, p) : null;
}
function createGameServer(opts = {}) {
  const log = opts.log || (() => {}), allowed = (opts.allowedOrigins || (process.env.ALLOWED_ORIGINS || '').split(',')).map(s => s.trim()).filter(Boolean);
  const manager = new RoomManager(opts.manager || {}), maxConnections = opts.maxConnections || 1000;
  const accounts = opts.accounts || createAccountStore({ file: process.env.NORI_ACCOUNTS_FILE || path.join(ROOT, 'data', 'accounts.json') });
  const oauthStates = new Map(), oauthTickets = new Map();
  const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const googleRedirectUri = () => process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';
  const html = (status, title, message) => { const body = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px system-ui;background:#0a0d13;color:#edf3ff;padding:32px;max-width:720px;margin:auto"><h1>${title}</h1><p>${message}</p><p><a style="color:#79b8ff" href="/">Вернуться в NORI</a></p></body></html>`; return { status, body }; };
  const headers = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP, 'X-Frame-Options': 'DENY' };
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    const pathname = url.split('?')[0];
    const sendJson = (status, obj) => { const body = JSON.stringify(obj); res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) }, headers)); res.end(body); };
    const readBody = cb => { let body = ''; req.on('data', chunk => { body += chunk; if (Buffer.byteLength(body) > 262144) { sendJson(413, { ok: false, code: 'BODY_TOO_LARGE' }); req.destroy(); } }); req.on('end', () => { try { cb(JSON.parse(body || '{}')); } catch (_) { sendJson(400, { ok: false, code: 'BAD_JSON' }); } }); };
    if (pathname.startsWith('/api/')) {
      if (req.method === 'GET' && pathname === '/api/oauth/google/status') return sendJson(200, { ok: true, configured: googleConfigured(), redirectUri: googleRedirectUri() });
      if (req.method === 'POST' && pathname === '/api/oauth/google/exchange') return readBody(body => { const ticket = typeof body.ticket === 'string' ? body.ticket : ''; const record = oauthTickets.get(ticket); oauthTickets.delete(ticket); if (!record || record.expiresAt < Date.now()) return sendJson(400, { ok: false, code: 'OAUTH_TICKET_EXPIRED' }); return sendJson(200, { ok: true, token: record.token, user: record.user }); });
      if (req.method === 'GET' && pathname === '/api/bots') return sendJson(200, { ok: true, bots: accounts.listBots() });
      if (req.method === 'GET' && pathname === '/api/me') {
        const auth = String(req.headers.authorization || ''), token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        const user = accounts.authenticate(token); return user ? sendJson(200, { ok: true, user }) : sendJson(401, { ok: false, code: 'UNAUTHENTICATED' });
      }
      if (req.method === 'POST' && ['/api/register', '/api/login', '/api/profile', '/api/logout'].includes(pathname)) {
        return readBody(body => {
          let result;
          if (pathname === '/api/register') result = accounts.create(body);
          else if (pathname === '/api/login') result = accounts.login(body);
          else {
            const auth = String(req.headers.authorization || ''); const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
            if (pathname === '/api/profile') result = accounts.updateProfile(token, body);
            else result = { ok: accounts.logout(token) };
          }
          if (!result.ok) return sendJson(result.code === 'UNAUTHENTICATED' ? 401 : 400, result);
          return sendJson(200, result);
        });
      }
      return sendJson(404, { ok: false, code: 'NOT_FOUND' });
    }
    if (req.method === 'GET' && pathname === '/auth/google') {
      if (!googleConfigured()) {
        const page = html(503, 'Google-вход не настроен', 'В NORI есть готовая кнопка и OAuth-маршрут, но администратору нужно задать GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET и GOOGLE_REDIRECT_URI. Не вводите пароль Google в NORI.');
        res.writeHead(page.status, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, headers)); return res.end(page.body);
      }
      const state = crypto.randomBytes(24).toString('base64url');
      oauthStates.set(state, Date.now() + 10 * 60 * 1000);
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: googleRedirectUri(), response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' }).toString();
      res.writeHead(302, Object.assign({ Location: u.toString(), 'Cache-Control': 'no-store' }, headers)); return res.end();
    }
    if (req.method === 'GET' && pathname === '/auth/google/callback') {
      (async () => {
        const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
        const state = u.searchParams.get('state') || '', expiresAt = oauthStates.get(state); oauthStates.delete(state);
        if (!expiresAt || expiresAt < Date.now() || u.searchParams.has('error')) { res.writeHead(302, Object.assign({ Location: '/?google_error=cancelled', 'Cache-Control': 'no-store' }, headers)); return res.end(); }
        const code = u.searchParams.get('code'); if (!code) throw new Error('Google не вернул код авторизации.');
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirectUri(), grant_type: 'authorization_code' }) });
        const tokens = await tokenRes.json(); if (!tokenRes.ok || !tokens.access_token) throw new Error('Google не подтвердил авторизацию. Проверьте настройки OAuth.');
        const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
        const profile = await userRes.json(); if (!userRes.ok) throw new Error('Не удалось получить профиль Google.');
        const result = accounts.loginWithGoogle({ sub: profile.sub, email: profile.email, email_verified: profile.email_verified === true || profile.email_verified === 'true', name: profile.name });
        if (!result.ok) {
          const page = html(400, 'Не удалось войти через Google', result.code === 'GOOGLE_EMAIL_EXISTS' ? 'Этот email уже используется аккаунтом NORI с паролем. Войдите обычным способом; автоматическое объединение аккаунтов не включено.' : 'Google не вернул подтверждённый профиль.');
          res.writeHead(page.status, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, headers)); return res.end(page.body);
        }
        const ticket = crypto.randomBytes(24).toString('base64url'); oauthTickets.set(ticket, { token: result.token, user: result.user, expiresAt: Date.now() + 60 * 1000 });
        res.writeHead(302, Object.assign({ Location: '/?oauth_ticket=' + encodeURIComponent(ticket), 'Cache-Control': 'no-store' }, headers)); return res.end();
      })().catch(err => {
        if (res.headersSent) return;
        const page = html(502, 'Ошибка входа Google', String(err && err.message || 'OAuth error').replace(/[<>]/g, ''));
        res.writeHead(page.status, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, headers)); res.end(page.body);
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, Object.assign({ Allow: 'GET, HEAD' }, headers)); return res.end(); }
    if (pathname === '/health') { const b = JSON.stringify({ ok: true }); res.writeHead(200, Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(b) }, headers)); return res.end(req.method === 'HEAD' ? undefined : b); }
    const file = staticPath(url);
    if (!file) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, headers)); return res.end('Not found'); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, headers)); return res.end('Not found'); }
      const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`, h = Object.assign({ 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag }, headers);   // revalidate on every load: friends never keep a stale JS after a deploy
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); return res.end(); }
      res.writeHead(200, Object.assign({ 'Content-Length': st.size }, h)); if (req.method === 'HEAD') return res.end(); fs.createReadStream(file).pipe(res);
    });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: P.MAX_BYTES });
  const originOk = req => { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host || allowed.includes(o); } catch (e) { return false; } };
  server.on('upgrade', (req, socket, head) => {
    const deny = code => { socket.write(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
    if ((req.url || '').split('?')[0] !== '/ws') return deny('404 Not Found');
    if (!originOk(req)) return deny('403 Forbidden');
    if (wss.clients.size >= maxConnections) return deny('503 Service Unavailable');
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
  const sw = setInterval(() => { manager.sweep(); }, opts.sweepMs || 60000); sw.unref();
  return {
    server, wss, manager, accounts,
    listen(port, host) { return new Promise((res, rej) => { server.once('error', rej); server.listen(port, host, () => res(server.address().port)); }); },
    close() { clearInterval(hb); clearInterval(sw); wss.clients.forEach(ws => ws.terminate()); return new Promise(res => { wss.close(() => server.close(() => res())); }); }
  };
}
module.exports = { createGameServer, staticPath };
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000, host = '0.0.0.0', app = createGameServer({ log: console.log });
  app.listen(port, host).then(p => console.log(`NORI server listening on http://${host}:${p} (in-memory rooms, reset on restart)`)).catch(e => { console.error('Cannot start server:', e.code || e.message); process.exit(1); });
  const stop = () => app.close().then(() => process.exit(0)); process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
