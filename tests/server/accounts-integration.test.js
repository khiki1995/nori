'use strict';
// Accounts meet games: rated online rooms (RoomManager hooks), protocol `auth` field, server-verified bot-win rewards.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const H = require('../harness.js'), P = require('../../server/protocol.js'), { RoomManager } = require('../../server/rooms.js');
const { verifyBotWin } = require('../../server/rewards.js'), { createAccountStore } = require('../../server/accounts.js'), { createGameServer } = require('../../server/index.js');
const N = globalThis.NORI, { suite, eq, ok } = H;
const conn = () => ({ seat: null, out: [], send(o) { this.out.push(JSON.parse(JSON.stringify(o))); }, close() {} });
const last = (c, type) => [...c.out].reverse().find(m => m.type === type);
// White = unprofiled maximin engine, Black = the bot: a short deterministic game White wins against bot-icarus.
function winningLine(botId) {
  let st = N.state.createInitialState(); const rounds = [];
  while (!st.result && rounds.length < 60) { const pair = [N.ai.chooseAIAction(st, 0, null), N.ai.chooseAIAction(st, 1, botId)]; rounds.push(pair); st = N.state.playRound(st, pair); }
  return { rounds, result: st.result };
}
function post(port, p, body, token) {
  return new Promise((res, rej) => { const data = JSON.stringify(body); const rq = http.request({ agent: false, host: '127.0.0.1', port, method: 'POST', path: p, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Authorization: 'Bearer ' + token } }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res({ status: r.statusCode, json: JSON.parse(b) })); }); rq.on('error', rej); rq.end(data); });
}
module.exports = async function () {
  const { results, t } = suite(); const line = winningLine('bot-icarus');
  t('protocol: create/join accept an optional auth token, reject a malformed one and unknown extra fields', () => {
    ok(P.parse(JSON.stringify({ v: 1, type: 'create_room', auth: 'a'.repeat(43) })).ok);
    ok(P.parse(JSON.stringify({ v: 1, type: 'join_room', code: 'ABCDEF', auth: 'a'.repeat(43) })).ok);
    eq(P.parse(JSON.stringify({ v: 1, type: 'create_room', auth: 'bad token!' })).code, 'INVALID_MESSAGE');
    eq(P.parse(JSON.stringify({ v: 1, type: 'create_room', extra: 1 })).code, 'INVALID_MESSAGE');
    eq(P.parse(JSON.stringify({ v: 1, type: 'submit_choice', round: 1, choice: { node: 1, action: 'CUT', edge: '1-2' }, auth: 'a'.repeat(43) })).code, 'INVALID_MESSAGE');
  });
  t('rooms: a finished game between two accounts is rated exactly once with the right score', () => {
    const calls = [], m = new RoomManager({ identify: tok => ({ ['tok-white-xxxxxxxxx']: 'u1', ['tok-black-xxxxxxxxx']: 'u2' })[tok] || null, onRated: (...a) => calls.push(a) });
    const a = conn(), b = conn(); m.handle(a, { type: 'create_room', auth: 'tok-white-xxxxxxxxx' }); const code = last(a, 'room_created').code; m.handle(b, { type: 'join_room', code, auth: 'tok-black-xxxxxxxxx' });
    line.rounds.forEach((pair, i) => { m.handle(a, { type: 'submit_choice', round: i + 1, choice: pair[0] }); m.handle(b, { type: 'submit_choice', round: i + 1, choice: pair[1] }); });
    eq(last(a, 'round_resolved').snapshot.game.result.winner, 0); eq(calls.length, 1); eq(JSON.stringify(calls[0]), JSON.stringify(['u1', 'u2', 1]));
    m.rate(m.rooms.get(code)); eq(calls.length, 1, 'rated twice');
  });
  t('rooms: guests and the same account on both seats are never rated', () => {
    const calls = [], m = new RoomManager({ identify: () => 'same', onRated: (...a) => calls.push(a) });
    const a = conn(), b = conn(); m.handle(a, { type: 'create_room', auth: 'x'.repeat(20) }); const code = last(a, 'room_created').code; m.handle(b, { type: 'join_room', code, auth: 'y'.repeat(20) });
    line.rounds.forEach((pair, i) => { m.handle(a, { type: 'submit_choice', round: i + 1, choice: pair[0] }); m.handle(b, { type: 'submit_choice', round: i + 1, choice: pair[1] }); });
    eq(calls.length, 0);
  });
  t('rewards: a genuine win verifies; a forged bot move, a lost or unfinished game and unknown bots do not', () => {
    eq(line.result.winner, 0, 'fixture must be a White win'); ok(verifyBotWin('bot-icarus', line.rounds).ok);
    const forged = line.rounds.map(p => p.slice()); forged[0][1] = { node: 1, action: 'CREATE', edge: '1-2' }; eq(verifyBotWin('bot-icarus', forged).code, 'NOT_BOT_MOVE');
    eq(verifyBotWin('bot-icarus', line.rounds.slice(0, -1)).code, 'NOT_A_WIN'); eq(verifyBotWin('nope', line.rounds).code, 'UNKNOWN_BOT'); eq(verifyBotWin('bot-icarus', []).code, 'INVALID_GAME');
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-int-')), accounts = createAccountStore({ file: path.join(dir, 'a.json'), writeDelayMs: 0 });
  const app = createGameServer({ accounts }), port = await app.listen(0, '127.0.0.1');
  try {
    const reg = await accounts.create({ email: 'coins@example.com', password: 'long-password-123', username: 'Coin_Hunter' });
    const first = await post(port, '/api/rewards/bot-win', { botId: 'bot-icarus', rounds: line.rounds }, reg.token);
    const again = await post(port, '/api/rewards/bot-win', { botId: 'bot-icarus', rounds: line.rounds }, reg.token);
    const guest = await post(port, '/api/rewards/bot-win', { botId: 'bot-icarus', rounds: line.rounds }, 'not-a-real-session-token');
    t('HTTP reward: first verified win credits the bot coins once, repeats get 409, guests get 401', () => {
      const bot = accounts.listBots().find(b => b.id === 'bot-icarus');
      eq(first.status, 200); eq(first.json.coins, bot.coins); eq(first.json.user.coins, bot.coins); ok(first.json.user.botWins.includes('bot-icarus'));
      eq(again.status, 409); eq(again.json.code, 'ALREADY_REWARDED'); eq(again.json.user.coins, bot.coins); eq(guest.status, 401);
    });
  } finally { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  return results;
};
