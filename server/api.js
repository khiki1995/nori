'use strict';
// JSON account API: register/login/profile/logout, current user, bot catalog, verified bot-win rewards.
const { sendJson, readJson, bearer } = require('./http.js'), { verifyBotWin } = require('./rewards.js');
const statusFor = r => (r.ok ? 200 : r.code === 'UNAUTHENTICATED' ? 401 : 400);

function createApiRoutes({ accounts, authLimiter }) {
  // Password checks and game replays are CPU-bound, so they share the per-IP limiter.
  const limited = handler => (req, res) => (authLimiter.allow(req) ? handler(req, res) : sendJson(res, 429, { ok: false, code: 'RATE_LIMITED' }));
  const json = fn => (req, res) => readJson(req, res, async body => { const r = await fn(body, req); sendJson(res, statusFor(r), r); });
  return {
    'GET /api/bots': (req, res) => sendJson(res, 200, { ok: true, bots: accounts.listBots() }),
    'GET /api/me': (req, res) => { const user = accounts.authenticate(bearer(req)); sendJson(res, user ? 200 : 401, user ? { ok: true, user } : { ok: false, code: 'UNAUTHENTICATED' }); },
    'POST /api/register': limited(json(body => accounts.create(body))),
    'POST /api/login': limited(json(body => accounts.login(body))),
    'POST /api/profile': json((body, req) => accounts.updateProfile(bearer(req), body)),
    'POST /api/logout': json((body, req) => ({ ok: accounts.logout(bearer(req)) })),
    'POST /api/rewards/bot-win': (req, res) => {
      const userId = accounts.userIdForToken(bearer(req)); if (!userId) return sendJson(res, 401, { ok: false, code: 'UNAUTHENTICATED' });
      limited((rq, rs) => readJson(rq, rs, body => {
        const v = verifyBotWin(body.botId, body.rounds); if (!v.ok) return sendJson(rs, 400, v);
        const r = accounts.grantBotWin(userId, body.botId); sendJson(rs, r.ok ? 200 : 409, r);
      }))(req, res);
    }
  };
}
module.exports = { createApiRoutes };
