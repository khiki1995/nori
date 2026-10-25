'use strict';
// HTTP account API on a real localhost server with a throwaway accounts file: rate limits, OAuth state sweep, multi-device sessions.
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const H = require('../harness.js'), { createGameServer } = require('../../server/index.js'), { createAccountStore } = require('../../server/accounts.js');
const { eq, ok } = H;
function request(port, method, p, body, headers = {}) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const rq = http.request({ agent: false, host: '127.0.0.1', port, method, path: p, headers: Object.assign(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, headers) }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => { let json = null; try { json = JSON.parse(b); } catch (_) { /* not json */ } res({ status: r.statusCode, headers: r.headers, body: b, json }); });
    });
    rq.on('error', rej); if (data) rq.write(data); rq.end();
  });
}
module.exports = async function () {
  const results = []; const t = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message }); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-http-')), accounts = createAccountStore({ file: path.join(dir, 'accounts.json') });
  const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
  process.env.GOOGLE_CLIENT_ID = 'test-client'; process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  const app = createGameServer({ accounts, authRateMax: 4, authRateWindowMs: 60000, maxOauthPending: 3, trustProxy: false }); const port = await app.listen(0, '127.0.0.1');
  try {
    await t('register + login on two devices: both sessions stay valid', async () => {
      const r = await request(port, 'POST', '/api/register', { email: 'multi@example.com', password: 'long-password-123', username: 'Multi_Dev' }); eq(r.status, 200, r.body);
      const l = await request(port, 'POST', '/api/login', { email: 'multi@example.com', password: 'long-password-123' }); eq(l.status, 200, l.body);
      for (const tok of [r.json.token, l.json.token]) eq((await request(port, 'GET', '/api/me', undefined, { Authorization: 'Bearer ' + tok })).status, 200);
    });
    await t('password endpoints are rate limited per IP with 429 RATE_LIMITED', async () => {
      // the previous test already spent 2 of the 4 attempts from this IP
      for (let i = 0; i < 2; i++) eq((await request(port, 'POST', '/api/login', { email: 'multi@example.com', password: 'wrong-password-x' })).status, 400);
      const blocked = await request(port, 'POST', '/api/login', { email: 'multi@example.com', password: 'long-password-123' });
      eq(blocked.status, 429); eq(blocked.json.code, 'RATE_LIMITED');
    });
    await t('oversized JSON body is rejected with 413 and malformed JSON with 400', async () => {
      // the server may close the socket while the client is still writing: a reset is an acceptable refusal too
      const big = await request(port, 'POST', '/api/profile', { bio: 'x'.repeat(300000) }).catch(e => ({ status: e.code }));
      ok([413, 'EPIPE', 'ECONNRESET'].includes(big.status), 'got ' + big.status);
      const bad = await new Promise((res, rej) => { const rq = http.request({ agent: false, host: '127.0.0.1', port, method: 'POST', path: '/api/profile', headers: { 'Content-Type': 'application/json' } }, r => { r.resume(); r.on('end', () => res(r.statusCode)); }); rq.on('error', rej); rq.end('{not json'); });
      eq(bad, 400);
    });
    await t('OAuth start: pending states are capped and expired entries are swept', async () => {
      for (let i = 0; i < 3; i++) eq((await request(port, 'GET', '/auth/google')).status, 302);
      eq((await request(port, 'GET', '/auth/google')).status, 503, 'cap reached'); eq(app.oauthPending, 3);
      const realNow = Date.now; Date.now = () => realNow() + 11 * 60 * 1000; try { app.sweepAuth(); } finally { Date.now = realNow; }
      eq(app.oauthPending, 0); eq((await request(port, 'GET', '/auth/google')).status, 302);
    });
    await t('CSP allows the Google Fonts stylesheet and font files', async () => {
      const csp = (await request(port, 'GET', '/')).headers['content-security-policy']; ok(/style-src[^;]*fonts\.googleapis\.com/.test(csp) && /font-src[^;]*fonts\.gstatic\.com/.test(csp), csp);
    });
  } finally {
    await app.close(); fs.rmSync(dir, { recursive: true, force: true });
    if (saved.id === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = saved.id;
    if (saved.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET; else process.env.GOOGLE_CLIENT_SECRET = saved.secret;
  }
  return results;
};
