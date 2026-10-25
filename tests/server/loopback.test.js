'use strict';
// Real HTTP + WebSocket server on localhost with real `ws` clients. This is an automated integration test, NOT a browser test.
const http = require('http'), { WebSocket } = require('ws'), H = require('../harness.js'), { createGameServer } = require('../../server/index.js');
const { eq, deq, ok, C } = H, W = C(3, 'CUT', '2-3'), B = C(8, 'CREATE', '3-8'), NOOP_W = C(1, 'CREATE', '1-2'), NOOP_B = C(5, 'CREATE', '5-6');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(port, p, headers) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p, headers }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: b })); }).on('error', rej)); }
function getBuf(port, p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p }, r => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(c) })); }).on('error', rej)); }
function connect(port, headers, p) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${p || '/ws'}`, { headers }), c = { ws, msgs: [], raw: [], closed: null };
    ws.on('message', d => { const s = d.toString(); c.raw.push(s); c.msgs.push(JSON.parse(s)); }); ws.on('close', code => { c.closed = code; }); ws.on('error', rej); ws.on('open', () => res(c));
    ws.on('unexpected-response', (rq, rs) => rej(Object.assign(new Error('HTTP ' + rs.statusCode), { status: rs.statusCode })));
  });
}
const send = (c, o) => c.ws.send(JSON.stringify(Object.assign({ v: 1 }, o)));
async function until(c, pred, ms = 2000, from = 0) { const t0 = Date.now(); for (;;) { const m = c.msgs.slice(from).find(pred); if (m) return m; if (Date.now() - t0 > ms) throw new Error('timeout waiting for message; got ' + c.msgs.map(x => x.type).join(',')); await sleep(10); } }
const type = t => m => m.type === t;
const choiceShaped = o => { if (!o || typeof o !== 'object') return false; if ('node' in o && 'action' in o && 'edge' in o) return true; return Object.values(o).some(choiceShaped); };

module.exports = async function () {
  const results = []; const t = async (name, fn) => { if (process.env.NORI_TEST_VERBOSE) console.log('... running:', name); try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message }); } };
  const app = createGameServer({ rateMax: 8, rateWindowMs: 60000, idleMs: 400, heartbeatMs: 100000 }); const port = await app.listen(0, '127.0.0.1'); const open = [];
  const cx = async (h, p) => { const c = await connect(port, h, p); open.push(c); return c; };
  const pair = async () => { const a = await cx(), b = await cx(); send(a, { type: 'create_room' }); const cr = await until(a, type('room_created')); send(b, { type: 'join_room', code: cr.code }); const jn = await until(b, type('room_joined')); return { a, b, code: cr.code, tokA: cr.token, tokB: jn.token }; };
  try {
    await t('HTTP: /health returns 200 {"ok":true}; index.html is served with revalidation headers; ETag gives 304', async () => {
      const h = await get(port, '/health'); eq(h.status, 200); deq(JSON.parse(h.body), { ok: true });
      const i = await get(port, '/'); eq(i.status, 200); ok(i.body.includes('<title>')); eq(i.headers['cache-control'], 'no-cache'); ok(i.headers['content-security-policy']); eq(i.headers['x-content-type-options'], 'nosniff');
      const n = await get(port, '/', { 'If-None-Match': i.headers.etag }); eq(n.status, 304); eq((await get(port, '/src/online.js')).status, 200);
    });
    await t('HTTP: server code, backups, node_modules and path traversal are not served', async () => {
      for (const p of ['/server/index.js', '/package.json', '/node_modules/ws/index.js', '/tests/run.js', '/tests/server/rooms.test.js', '/../package.json', '/%2e%2e/package.json', '/src/..%2f..%2fpackage.json', '/src/%00.js']) eq((await get(port, p)).status, 404, p);
      const r = await new Promise(res => http.request({ host: '127.0.0.1', port, path: '/', method: 'POST' }, x => res(x.statusCode)).end()); eq(r, 405);
    });
    await t('HTTP: manifest and icons are served with correct content types and real PNG data; traversal and unknown icons give 404', async () => {
      const m = await getBuf(port, '/manifest.webmanifest'); eq(m.status, 200); ok(/application\/manifest\+json/.test(m.headers['content-type']), m.headers['content-type']); const j = JSON.parse(m.body.toString('utf8')); ok(j.icons.length >= 3);
      for (const i of j.icons) { const r = await getBuf(port, '/' + i.src); eq(r.status, 200, i.src); eq(r.headers['content-type'], 'image/png'); eq(r.body.slice(1, 4).toString(), 'PNG'); eq(r.body.readUInt32BE(16), Number(i.sizes.split('x')[0])); }
      const svg = await getBuf(port, '/icons/icon.svg'); eq(svg.status, 200); eq(svg.headers['content-type'], 'image/svg+xml');
      for (const p of ['/icons/nope.png', '/icons/../package.json', '/icons/%2e%2e/package.json', '/icons/a/b.png', '/icons/x.txt']) eq((await getBuf(port, p)).status, 404, p);
    });
    await t('two real clients: create, join, White/Black seats, lobby updates', async () => {
      const { a, b, code } = await pair(); ok(/^[A-HJ-NP-Z2-9]{6}$/.test(code)); eq((await until(a, type('room_created'))).playerIndex, 0); eq((await until(b, type('room_joined'))).playerIndex, 1);
      eq((await until(a, m => m.type === 'lobby_update' && m.opponentConnected)).you, 0); eq((await until(b, type('lobby_update'))).you, 1);
    });
    await t('hidden choices over the wire: the opponent learns only a boolean until both have chosen; then both get the same reveal', async () => {
      const { a, b } = await pair(); send(a, { type: 'submit_choice', round: 1, choice: W }); await until(a, type('choice_locked')); const st = await until(b, type('opponent_status')); deq(st, { v: 1, type: 'opponent_status', round: 1, opponentLocked: true });
      await sleep(80); ok(!b.msgs.some(type('round_resolved'))); ok(!b.raw.join('').includes('"CUT"'), 'action leaked to Black'); ok(!b.msgs.some(choiceShaped), 'choice-shaped data sent to Black before reveal');
      send(b, { type: 'submit_choice', round: 1, choice: B }); const ra = await until(a, type('round_resolved')), rb = await until(b, type('round_resolved'));
      deq(ra.choices, [W, B]); deq(rb.choices, [W, B]); deq(ra.snapshot.game, rb.snapshot.game); eq(ra.snapshot.game.round, 2); eq(ra.snapshot.seat.index, 0); eq(rb.snapshot.seat.index, 1);
    });
    await t('protocol abuse is handled safely: bad JSON, unknown type, wrong round, duplicate, extra fields, binary frames; the connection survives', async () => {
      const { a, b } = await pair(); a.ws.send('{{'); eq((await until(a, m => m.type === 'error' && m.code === 'BAD_JSON')).v, 1);
      send(a, { type: 'nope' }); await until(a, m => m.code === 'UNKNOWN_TYPE'); send(a, { type: 'submit_choice', round: 9, choice: W }); await until(a, m => m.code === 'ROUND_MISMATCH');
      send(a, { type: 'submit_choice', round: 1, choice: Object.assign({ committed: true }, W) }); await until(a, m => m.code === 'INVALID_MESSAGE'); a.ws.send(Buffer.from([1, 2, 3])); await until(a, m => m.code === 'INVALID_MESSAGE', 2000, a.msgs.length - 1 > 0 ? 0 : 0);
      send(a, { type: 'submit_choice', round: 1, choice: W }); send(a, { type: 'submit_choice', round: 1, choice: NOOP_W }); await until(a, m => m.code === 'DUPLICATE_CHOICE');
      const e = a.msgs.filter(type('error')); ok(e.every(x => !/at |\.js:/.test(JSON.stringify(x)))); eq(a.closed, null); eq(b.msgs.filter(type('round_resolved')).length, 0);
    });
    await t('oversized frames are refused by the server (connection closed)', async () => { const a = await cx(); a.ws.send(JSON.stringify({ v: 1, type: 'create_room', pad: 'x'.repeat(20000) })); await sleep(300); ok(a.closed !== null, 'not closed'); });
    await t('rate limiting: a flood is answered with RATE_LIMITED', async () => { const a = await cx(); for (let i = 0; i < 20; i++) send(a, { type: 'request_snapshot' }); await until(a, m => m.code === 'RATE_LIMITED'); });
    await t('Origin check: foreign origin rejected (403), same origin and no origin accepted', async () => {
      let st = 0; try { await connect(port, { Origin: 'https://evil.example' }); } catch (e) { st = e.status; } eq(st, 403);
      const same = await connect(port, { Origin: `http://127.0.0.1:${port}` }); same.ws.close(); const none = await connect(port); none.ws.close();
      let st2 = 0; try { await connect(port, {}, '/other'); } catch (e) { st2 = e.status; } eq(st2, 404);
    });
    await t('disconnect keeps the room; reconnect with the token restores the seat; the code alone cannot hijack it', async () => {
      const { a, b, code, tokA } = await pair(); send(a, { type: 'submit_choice', round: 1, choice: W }); await until(a, type('choice_locked')); a.ws.close(); await until(b, m => m.type === 'lobby_update' && m.opponentConnected === false);
      const thief = await cx(); send(thief, { type: 'join_room', code }); await until(thief, m => m.code === 'ROOM_FULL'); send(thief, { type: 'resume_room', code, token: 'A'.repeat(32) }); await until(thief, m => m.code === 'BAD_TOKEN');
      const a2 = await cx(); send(a2, { type: 'resume_room', code, token: tokA }); const r = await until(a2, type('room_resumed')); eq(r.playerIndex, 0); eq(r.snapshot.seat.youLocked, true); ok(!a2.msgs.some(choiceShaped));
      await until(b, m => m.type === 'lobby_update' && m.opponentConnected === true); send(b, { type: 'submit_choice', round: 1, choice: B }); eq((await until(a2, type('round_resolved'))).snapshot.game.round, 2);
    });
    await t('a second connection with the same token replaces the first (old socket closed with 4001)', async () => {
      const { a, code, tokA } = await pair(); const a2 = await cx(); send(a2, { type: 'resume_room', code, token: tokA }); await until(a2, type('room_resumed')); await sleep(100); eq(a.closed, 4001);
    });
    await t('unauthenticated idle sockets are closed; a missing room gives the "room gone" error', async () => {
      const a = await cx(); await sleep(700); eq(a.closed, 4003); const b = await cx(); send(b, { type: 'resume_room', code: 'ZZZZZZ', token: 'A'.repeat(32) }); await until(b, m => m.code === 'ROOM_NOT_FOUND');
    });
    await t('full game to the end over sockets: draw by repetition reaches both clients, then actions are refused', async () => {
      const { a, b } = await pair(); for (let r = 1; r <= 2; r++) { send(a, { type: 'submit_choice', round: r, choice: NOOP_W }); send(b, { type: 'submit_choice', round: r, choice: NOOP_B }); await until(a, m => m.type === 'round_resolved' && m.round === r); await until(b, m => m.type === 'round_resolved' && m.round === r); }
      const fin = a.msgs.filter(type('round_resolved')).pop(); eq(fin.snapshot.game.result.type, 'draw'); eq(b.msgs.filter(type('round_resolved')).pop().snapshot.game.result.code, 'THREEFOLD_REPETITION');
      send(a, { type: 'submit_choice', round: 3, choice: NOOP_W }); await until(a, m => m.code === 'GAME_OVER');
    });
    await t('two rooms over sockets do not influence each other', async () => {
      const p1 = await pair(), p2 = await pair(); send(p1.a, { type: 'submit_choice', round: 1, choice: W }); send(p1.b, { type: 'submit_choice', round: 1, choice: B }); await until(p1.a, type('round_resolved')); await sleep(100);
      eq(p2.a.msgs.filter(type('round_resolved')).length + p2.b.msgs.filter(type('round_resolved')).length, 0); send(p2.a, { type: 'request_snapshot' }); eq((await until(p2.a, type('snapshot'))).snapshot.game.round, 1);
    });
    await t('server log/protocol: tokens are 24 random bytes (base64url) and differ per seat and per room', async () => {
      const x = await pair(), y = await pair(); const toks = [x.tokA, x.tokB, y.tokA, y.tokB]; eq(new Set(toks).size, 4); toks.forEach(k => ok(/^[A-Za-z0-9_-]{32}$/.test(k), k));
    });
    await t('heartbeat: a client that never answers ping is terminated; a normal client stays connected', async () => {
      const hb = createGameServer({ heartbeatMs: 120 }), hp = await hb.listen(0, '127.0.0.1');
      try {
        const dead = new WebSocket(`ws://127.0.0.1:${hp}/ws`, { autoPong: false }); let closed = null; dead.on('close', c => { closed = c; }); const opened = new Promise(r => dead.on('open', r));
        const live = await connect(hp); await opened;
        await sleep(700); ok(closed !== null, 'unresponsive client was not terminated'); eq(live.closed, null, 'responsive client must stay connected'); live.ws.terminate();
      } finally { await hb.close(); }
    });
  } finally { open.forEach(c => { try { c.ws.terminate(); } catch (e) { /* ignore */ } }); await app.close(); }
  return results;
};
