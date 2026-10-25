'use strict';
// NORI account/profile/rating foundation. Google sign-in is a real OAuth path when configured; no social provider credentials are hardcoded.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const MAX_SESSIONS_PER_USER = 10, SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BOT_PROFILES = require('../src/bots-data.json');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[\p{L}\p{N}_ -]{3,20}$/u;
const publicUser = u => ({ id: u.id, username: u.username, avatar: u.avatar, bio: u.bio, rating: u.rating, coins: u.coins, gamesPlayed: u.gamesPlayed, wins: u.wins, botWins: Object.keys(u.botWins || {}), createdAt: u.createdAt });
const tokenHash = t => crypto.createHash('sha256').update(t).digest('hex');
function eloExpected(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }
function updateElo(a, b, scoreA, k = 24) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || ![0, 0.5, 1].includes(scoreA)) throw new TypeError('INVALID_RATING_INPUT');
  return { a: Math.round(a + k * (scoreA - eloExpected(a, b))), b: Math.round(b + k * ((1 - scoreA) - eloExpected(b, a))) };
}
function createAccountStore(opts = {}) {
  const file = opts.file || path.join(process.cwd(), 'data', 'accounts.json');
  const now = opts.now || (() => Date.now());
  let data = { users: [], sessions: [] };
  function load() { try { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.sessions)) data = parsed; } catch (_) {} }
  // Writes are coalesced: many changes within `writeDelayMs` become one atomic rewrite of the file.
  // flush() writes immediately (shutdown, tests). writeDelayMs: 0 keeps the old write-per-change behaviour.
  const writeDelayMs = opts.writeDelayMs === undefined ? 200 : opts.writeDelayMs; let timer = null;
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 }); fs.renameSync(tmp, file);
  }
  function save() { if (!writeDelayMs) return flush(); if (!timer) { timer = setTimeout(() => { timer = null; try { flush(); } catch (e) { console.error('accounts: write failed:', e.code || e.message); } }, writeDelayMs); timer.unref(); } }
  load();
  data.sessions = data.sessions.filter(x => x.expiresAt > now());
  function findByEmail(email) { return data.users.find(u => u.email === email.toLowerCase()); }
  // Async: scrypt runs on the libuv thread pool, so a burst of logins never blocks game sockets.
  async function create({ email, password, username } = {}) {
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) return { ok: false, code: 'INVALID_EMAIL' };
    if (typeof password !== 'string' || password.length < 10 || password.length > 200) return { ok: false, code: 'WEAK_PASSWORD' };
    if (typeof username !== 'string' || !NAME_RE.test(username.trim())) return { ok: false, code: 'INVALID_USERNAME' };
    email = email.toLowerCase().trim(); username = username.trim();
    if (findByEmail(email)) return { ok: false, code: 'EMAIL_EXISTS' };
    if (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return { ok: false, code: 'USERNAME_EXISTS' };
    const salt = crypto.randomBytes(16).toString('hex'), passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    if (findByEmail(email)) return { ok: false, code: 'EMAIL_EXISTS' };   // re-check: another request may have won during the await
    if (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return { ok: false, code: 'USERNAME_EXISTS' };
    const user = { id: crypto.randomUUID(), email, username, avatar: '', bio: '', rating: 1000, coins: 0, gamesPlayed: 0, wins: 0, createdAt: new Date(now()).toISOString(), salt, passwordHash };
    data.users.push(user); const token = issue(user.id); save(); return { ok: true, user: publicUser(user), token };
  }
  // Several devices may stay signed in at once; only the newest MAX_SESSIONS_PER_USER sessions of a user are kept.
  function issue(userId) {
    const token = crypto.randomBytes(32).toString('base64url'), t = now();
    const mine = data.sessions.filter(s => s.userId === userId && s.expiresAt > t).slice(-(MAX_SESSIONS_PER_USER - 1));
    data.sessions = data.sessions.filter(s => s.userId !== userId && s.expiresAt > t).concat(mine, [{ hash: tokenHash(token), userId, expiresAt: t + SESSION_TTL_MS }]);
    return token;
  }
  async function login({ email, password } = {}) {
    const user = typeof email === 'string' ? findByEmail(email.trim().toLowerCase()) : null;
    if (!user || !user.salt || !user.passwordHash || typeof password !== 'string') return { ok: false, code: 'INVALID_CREDENTIALS' };
    if (password.length > 200) return { ok: false, code: 'INVALID_CREDENTIALS' };
    const candidate = await scrypt(password, user.salt, 64);
    const expected = Buffer.from(user.passwordHash, 'hex');
    if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) return { ok: false, code: 'INVALID_CREDENTIALS' };
    const token = issue(user.id); save(); return { ok: true, user: publicUser(user), token };
  }
  function authenticate(token) { if (typeof token !== 'string' || token.length > 200) return null; const s = data.sessions.find(x => x.hash === tokenHash(token) && x.expiresAt > now()); const u = s && data.users.find(x => x.id === s.userId); return u ? publicUser(u) : null; }
  function updateProfile(token, patch) {
    const pub = authenticate(token), u = pub && data.users.find(x => x.id === pub.id); if (!u) return { ok: false, code: 'UNAUTHENTICATED' };
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(k => !['username', 'avatar', 'bio'].includes(k))) return { ok: false, code: 'INVALID_PROFILE' };
    if ('username' in patch) { if (typeof patch.username !== 'string' || !NAME_RE.test(patch.username.trim())) return { ok: false, code: 'INVALID_USERNAME' }; const name = patch.username.trim(); if (data.users.some(x => x.id !== u.id && x.username.toLowerCase() === name.toLowerCase())) return { ok: false, code: 'USERNAME_EXISTS' }; u.username = name; }
    if ('avatar' in patch) { if (typeof patch.avatar !== 'string' || patch.avatar.length > 200000 || (patch.avatar && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(patch.avatar))) return { ok: false, code: 'INVALID_AVATAR' }; u.avatar = patch.avatar; }
    if ('bio' in patch) { if (typeof patch.bio !== 'string' || patch.bio.length > 240) return { ok: false, code: 'INVALID_BIO' }; u.bio = patch.bio.trim(); }
    save(); return { ok: true, user: publicUser(u) };
  }
  function loginWithGoogle(profile) {
    if (!profile || typeof profile.sub !== 'string' || !profile.sub || typeof profile.email !== 'string' || profile.email_verified !== true || !EMAIL_RE.test(profile.email)) return { ok: false, code: 'INVALID_GOOGLE_PROFILE' };
    let user = data.users.find(u => u.googleSub === profile.sub);
    if (user) { const token = issue(user.id); save(); return { ok: true, user: publicUser(user), token, created: false }; }
    const email = profile.email.trim().toLowerCase();
    if (findByEmail(email)) return { ok: false, code: 'GOOGLE_EMAIL_EXISTS' };
    let base = String(profile.name || 'Google Player').replace(/[^\p{L}\p{N}_ -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (base.length < 3) base = 'Player' + crypto.randomBytes(2).toString('hex');
    let username = base, suffix = 2;
    while (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      const tail = String(suffix++); username = base.slice(0, 20 - tail.length).trim() + tail;
    }
    user = { id: crypto.randomUUID(), email, username, avatar: '', bio: '', rating: 1000, coins: 0, gamesPlayed: 0, wins: 0, createdAt: new Date(now()).toISOString(), googleSub: profile.sub, salt: '', passwordHash: '' };
    data.users.push(user); const token = issue(user.id); save(); return { ok: true, user: publicUser(user), token, created: true };
  }
  function userIdForToken(token) { const u = authenticate(token); return u ? u.id : null; }
  // Rated result between two accounts (online games). scoreA: 1 = A won, 0.5 = draw, 0 = B won.
  function recordRatedResultByIds(idA, idB, scoreA) {
    const a = data.users.find(x => x.id === idA), b = data.users.find(x => x.id === idB);
    if (!a || !b || a.id === b.id) return { ok: false, code: 'INVALID_PLAYERS' };
    const r = updateElo(a.rating, b.rating, scoreA);
    a.rating = r.a; b.rating = r.b; a.gamesPlayed++; b.gamesPlayed++; if (scoreA === 1) a.wins++; else if (scoreA === 0) b.wins++;
    save(); return { ok: true, a: publicUser(a), b: publicUser(b) };
  }
  function recordRatedResult(tokenA, tokenB, scoreA) { return recordRatedResultByIds(userIdForToken(tokenA), userIdForToken(tokenB), scoreA); }
  // One-time coin reward for the first verified win against each bot. The caller verifies the game itself.
  function grantBotWin(userId, botId) {
    const u = data.users.find(x => x.id === userId), bot = BOT_PROFILES.find(b => b.id === botId);
    if (!u) return { ok: false, code: 'UNAUTHENTICATED' }; if (!bot) return { ok: false, code: 'UNKNOWN_BOT' };
    u.botWins = u.botWins || {}; if (u.botWins[botId]) return { ok: false, code: 'ALREADY_REWARDED', user: publicUser(u) };
    u.botWins[botId] = new Date(now()).toISOString(); u.coins += bot.coins; u.gamesPlayed++; u.wins++;
    save(); return { ok: true, coins: bot.coins, user: publicUser(u) };
  }
  function logout(token) { const hash = tokenHash(String(token || '')); const before = data.sessions.length; data.sessions = data.sessions.filter(s => s.hash !== hash); save(); return before !== data.sessions.length; }
  return { create, login, loginWithGoogle, authenticate, userIdForToken, updateProfile, recordRatedResult, recordRatedResultByIds, grantBotWin, logout, flush, listBots: () => BOT_PROFILES.map(b => ({ ...b })), get file() { return file; } };
}
module.exports = { createAccountStore, updateElo, eloExpected, BOT_PROFILES, publicUser };
