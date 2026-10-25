'use strict';
// Google sign-in (authorization code flow). Enabled only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
// The browser never sees the account token in a URL: the callback hands out a one-minute single-use ticket instead.
const crypto = require('crypto'), { sendJson, sendHtml, redirect, readJson } = require('./http.js');
const STATE_TTL_MS = 10 * 60 * 1000, TICKET_TTL_MS = 60 * 1000, GOOGLE_TIMEOUT_MS = 10000;
const configured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const redirectUri = () => process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

function createGoogleAuth({ accounts, maxPending = 5000, log = () => {} }) {
  const states = new Map(), tickets = new Map();
  function sweep() { const t = Date.now(); for (const [k, exp] of states) if (exp < t) states.delete(k); for (const [k, rec] of tickets) if (rec.expiresAt < t) tickets.delete(k); }
  function start(req, res) {
    if (!configured()) return sendHtml(res, 503, 'Google-вход не настроен', 'В NORI есть готовая кнопка и OAuth-маршрут, но администратору нужно задать GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET и GOOGLE_REDIRECT_URI. Не вводите пароль Google в NORI.');
    if (states.size >= maxPending) sweep();
    if (states.size >= maxPending) return sendHtml(res, 503, 'Сервер занят', 'Слишком много незавершённых входов. Попробуйте через минуту.');
    const state = crypto.randomBytes(24).toString('base64url'); states.set(state, Date.now() + STATE_TTL_MS);
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' }).toString();
    redirect(res, u.toString());
  }
  async function callback(req, res) {
    const u = new URL(req.url, 'http://localhost');
    const state = u.searchParams.get('state') || '', expiresAt = states.get(state); states.delete(state);
    if (!expiresAt || expiresAt < Date.now() || u.searchParams.has('error')) return redirect(res, '/?google_error=cancelled');
    const code = u.searchParams.get('code'); if (!code) throw new Error('Google не вернул код авторизации.');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(), grant_type: 'authorization_code' }) });
    const tokens = await tokenRes.json(); if (!tokenRes.ok || !tokens.access_token) throw new Error('Google не подтвердил авторизацию. Проверьте настройки OAuth.');
    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS), headers: { Authorization: 'Bearer ' + tokens.access_token } });
    const profile = await userRes.json(); if (!userRes.ok) throw new Error('Не удалось получить профиль Google.');
    const result = accounts.loginWithGoogle({ sub: profile.sub, email: profile.email, email_verified: profile.email_verified === true || profile.email_verified === 'true', name: profile.name });
    if (!result.ok) return sendHtml(res, 400, 'Не удалось войти через Google', result.code === 'GOOGLE_EMAIL_EXISTS' ? 'Этот email уже используется аккаунтом NORI с паролем. Войдите обычным способом; автоматическое объединение аккаунтов не включено.' : 'Google не вернул подтверждённый профиль.');
    const ticket = crypto.randomBytes(24).toString('base64url'); tickets.set(ticket, { token: result.token, user: result.user, expiresAt: Date.now() + TICKET_TTL_MS });
    redirect(res, '/?oauth_ticket=' + encodeURIComponent(ticket));
  }
  function exchange(req, res) {
    readJson(req, res, body => {
      const ticket = typeof body.ticket === 'string' ? body.ticket : '', record = tickets.get(ticket); tickets.delete(ticket);
      if (!record || record.expiresAt < Date.now()) return sendJson(res, 400, { ok: false, code: 'OAUTH_TICKET_EXPIRED' });
      sendJson(res, 200, { ok: true, token: record.token, user: record.user });
    });
  }
  const routes = {
    'GET /auth/google': start,
    'GET /auth/google/callback': (req, res) => callback(req, res).catch(err => {
      log('oauth: google callback failed:', err && (err.name === 'TimeoutError' ? 'timeout' : err.message));
      if (!res.headersSent) sendHtml(res, 502, 'Ошибка входа Google', err && err.name === 'TimeoutError' ? 'Google не ответил вовремя. Попробуйте ещё раз.' : String(err && err.message || 'OAuth error'));
    }),
    'GET /api/oauth/google/status': (req, res) => sendJson(res, 200, { ok: true, configured: configured(), redirectUri: redirectUri() }),
    'POST /api/oauth/google/exchange': exchange
  };
  return { routes, sweep, get pending() { return states.size + tickets.size; } };
}
module.exports = { createGoogleAuth };
