'use strict';
// Server logic tests without sockets: fake connections record every message the server would send.
const path = require('path'), H = require('../harness.js'), P = require('../../server/protocol.js'), { RoomManager } = require('../../server/rooms.js');
const N = globalThis.NORI, { suite, eq, deq, ok, C } = H;
const W = C(3, 'CUT', '2-3'), B = C(8, 'CREATE', '3-8'), NOOP_W = C(1, 'CREATE', '1-2'), NOOP_B = C(5, 'CREATE', '5-6');
const conn = () => ({ seat: null, out: [], closed: null, send(o) { this.out.push(JSON.parse(JSON.stringify(o))); }, close(c) { this.closed = c; } });
const last = (c, type) => [...c.out].reverse().find(m => m.type === type);
const ids = (c, type) => c.out.filter(m => m.type === type);
const choiceShaped = o => { if (!o || typeof o !== 'object') return false; if ('node' in o && 'action' in o && 'edge' in o) return true; return Object.values(o).some(choiceShaped); };
function setup(opts) { const m = new RoomManager(opts), a = conn(), b = conn(); m.handle(a, { type: 'create_room' }); const code = last(a, 'room_created').code; m.handle(b, { type: 'join_room', code }); return { m, a, b, code, room: m.rooms.get(code), tokA: last(a, 'room_created').token, tokB: last(b, 'room_joined').token }; }
const sub = (m, c, round, ch) => m.handle(c, { type: 'submit_choice', round, choice: ch });

module.exports = function () {
  const { results, t } = suite();
  t('create room: 6-char code from the safe alphabet, creator is White (index 0), secret token given to the creator', () => {
    const m = new RoomManager(), a = conn(); m.handle(a, { type: 'create_room' }); const r = last(a, 'room_created');
    ok(P.CODE_RE.test(r.code), r.code); eq(r.playerIndex, 0); ok(typeof r.token === 'string' && r.token.length >= 30); eq(r.v, 1); eq(r.snapshot.seat.opponentPresent, false);
  });
  t('join room: second player is Black (index 1) and both get a lobby update; the joiner gets its own token', () => {
    const { a, b, tokA, tokB } = setup(); eq(last(b, 'room_joined').playerIndex, 1); ok(tokA !== tokB); eq(last(a, 'lobby_update').opponentConnected, true); eq(last(b, 'lobby_update').you, 1);
  });
  t('room codes: unique, never an incrementing counter, only characters without I/O/0/1 (200 real crypto codes)', () => {
    const m = new RoomManager({ maxRooms: 1000 }), set = new Set(); for (let i = 0; i < 200; i++) { const c = conn(); m.handle(c, { type: 'create_room' }); const code = last(c, 'room_created').code; ok(!/[IO01]/.test(code), code); set.add(code); }
    eq(set.size, 200); const sorted = [...set]; ok(sorted.join() !== [...sorted].sort().join(), 'codes look sequential');
  });
  t('reject malformed, unknown, and full codes', () => {
    ['', 'abc', 'ABCDE1', 'ABCDEFG', 'OOOOOO', null, 5].forEach(code => { const r = P.parse(JSON.stringify({ v: 1, type: 'join_room', code })); eq(r.ok, false, String(code)); eq(r.code, 'BAD_CODE'); });
    const m = new RoomManager(), c = conn(); m.handle(c, { type: 'join_room', code: 'AAAAAA' }); eq(last(c, 'error').code, 'ROOM_NOT_FOUND');
    const { m: m2, code } = setup(); const third = conn(); m2.handle(third, { type: 'join_room', code }); eq(last(third, 'error').code, 'ROOM_FULL'); eq(third.seat, null);
  });
  t('code input is normalized (lowercase and spaces accepted)', () => { const r = P.parse(JSON.stringify({ v: 1, type: 'join_room', code: ' ab23cd ' })); ok(r.ok); eq(r.msg.code, 'AB23CD'); });
  t('initial server state equals the local engine initial state', () => {
    const { a } = setup(), g = last(a, 'room_created').snapshot.game, L = N.state.createInitialState();
    deq(g, { version: L.version, round: L.round, edges: L.edges, streak: L.streak, rounds: L.rounds, result: L.result });
  });
  t('a connection cannot create/join twice, and cannot submit without a seat or before the opponent joined', () => {
    const m = new RoomManager(), a = conn(), x = conn(); m.handle(a, { type: 'create_room' }); m.handle(a, { type: 'create_room' }); eq(last(a, 'error').code, 'ALREADY_IN_ROOM');
    sub(m, x, 1, W); eq(last(x, 'error').code, 'NOT_IN_ROOM'); sub(m, a, 1, W); eq(last(a, 'error').code, 'OPPONENT_MISSING');
  });
  t('first choice is stored by the server but NOT revealed to the opponent in any message or snapshot', () => {
    const { m, a, b, tokB, code } = setup(); sub(m, a, 1, W);
    eq(last(a, 'choice_locked').round, 1); deq(last(b, 'opponent_status'), { v: 1, type: 'opponent_status', round: 1, opponentLocked: true });
    const bm = JSON.stringify(b.out); ok(!bm.includes('"CUT"'), 'action leaked'); ok(!choiceShaped(b.out), 'choice-shaped object sent to the opponent');
    m.handle(b, { type: 'request_snapshot' }); eq(last(b, 'snapshot').snapshot.seat.opponentLocked, true); ok(!choiceShaped(last(b, 'snapshot')));
    const b2 = conn(); m.handle(b2, { type: 'resume_room', code, token: tokB }); ok(!choiceShaped(b2.out), 'leak on resume'); ok(!JSON.stringify(b2.out).includes('"CUT"'));
    m.handle(a, { type: 'request_snapshot' }); const own = JSON.stringify(last(a, 'snapshot')); ok(!own.includes('"CUT"') && !choiceShaped(last(a, 'snapshot')), 'own choice echoed back');
  });
  t('player tokens never appear in any message other than the owner\'s room_created/room_joined', () => {
    const { m, a, b, tokA, tokB } = setup(); sub(m, a, 1, W); sub(m, b, 1, B);
    [a, b].forEach(c => c.out.forEach(msg => { const s = JSON.stringify(msg); if (msg.type === 'room_created' || msg.type === 'room_joined') return; ok(!s.includes(tokA) && !s.includes(tokB), 'token in ' + msg.type); }));
    ok(!JSON.stringify(b.out.filter(x => x.type !== 'room_joined')).includes(tokA)); ok(!JSON.stringify(a.out.filter(x => x.type !== 'room_created')).includes(tokB));
  });
  t('own choice is accepted only once per round; the duplicate cannot replace the first', () => {
    const { m, a, b, room } = setup(); sub(m, a, 1, W); sub(m, a, 1, C(1, 'CREATE', '1-2')); eq(last(a, 'error').code, 'DUPLICATE_CHOICE'); deq(room.pending[0], W);
    sub(m, b, 1, B); deq(room.state.rounds[0].choices[0], W); eq(room.state.rounds.length, 1);
  });
  t('before the second choice the authoritative state does not change', () => {
    const { m, a, room } = setup(), before = JSON.stringify(room.state); sub(m, a, 1, W); eq(JSON.stringify(room.state), before); eq(room.state.round, 1); deq(room.state.edges, N.C.RING); eq(room.state.rounds.length, 0); eq(room.state.result, null);
  });
  t('after the second choice playRound runs exactly once; both players get the same revealed result', () => {
    const { m, a, b, room } = setup(); const orig = N.state.playRound; let calls = 0; N.state.playRound = (...x) => { calls++; return orig(...x); };
    try { sub(m, a, 1, W); eq(calls, 0); sub(m, b, 1, B); } finally { N.state.playRound = orig; }
    eq(calls, 1); const ra = last(a, 'round_resolved'), rb = last(b, 'round_resolved'); deq(ra.choices, [W, B]); deq(rb.choices, [W, B]); deq(ra.record, rb.record); eq(ra.snapshot.game.round, 2); deq(ra.snapshot.game, rb.snapshot.game);
    deq(room.pending, [null, null]); ok(!room.state.edges.includes('2-3') && room.state.edges.includes('3-8')); eq(ra.snapshot.seat.youLocked, false); eq(ra.record.commitments.join(), 'true,true');
  });
  t('the server computes commitment itself and ignores/forbids client-supplied derived fields', () => {
    ['committed', 'winner', 'edges', 'streak', 'seen', 'events', 'result'].forEach(k => {
      const top = P.parse(JSON.stringify({ v: 1, type: 'submit_choice', round: 1, choice: W, [k]: true })), inner = P.parse(JSON.stringify({ v: 1, type: 'submit_choice', round: 1, choice: Object.assign({}, W, { [k]: true }) }));
      eq(top.ok, false, 'top ' + k); eq(inner.ok, false, 'inner ' + k);
    });
  });
  t('invalid node/action/edge, wrong round and malformed messages are rejected safely', () => {
    const { m, a, room } = setup();
    [C(11, 'CUT', '1-2'), C(0, 'CUT', '1-2'), C(1, 'cut', '1-2'), C(1, 'CUT', '1-5'), C(1, 'CUT', '2-1')].forEach(ch => { sub(m, a, 1, ch); eq(last(a, 'error').code, 'INVALID_CHOICE', JSON.stringify(ch)); });
    sub(m, a, 7, W); eq(last(a, 'error').code, 'ROUND_MISMATCH'); eq(last(a, 'error').round, 1); deq(room.pending, [null, null]);
    [['{{', 'BAD_JSON'], ['[]', 'INVALID_MESSAGE'], ['null', 'INVALID_MESSAGE'], ['"x"', 'INVALID_MESSAGE'], [JSON.stringify({ v: 2, type: 'create_room' }), 'INVALID_MESSAGE'], [JSON.stringify({ v: 1, type: 'nope' }), 'UNKNOWN_TYPE'],
      [JSON.stringify({ v: 1, type: 'create_room', extra: 1 }), 'INVALID_MESSAGE'], [JSON.stringify({ v: 1, type: 'submit_choice', round: '1', choice: W }), 'INVALID_MESSAGE'], [JSON.stringify({ v: 1, type: 'submit_choice', round: 1, choice: { node: '3', action: 'CUT', edge: '2-3' } }), 'INVALID_MESSAGE'],
      ['{"v":1,"type":"create_room","__proto__":{"x":1}}', 'INVALID_MESSAGE'], [' '.repeat(P.MAX_BYTES + 1), 'TOO_LARGE'], [JSON.stringify({ v: 1, type: 'create_room', pad: 'x'.repeat(20000) }), 'TOO_LARGE']
    ].forEach(([raw, code]) => { const r = P.parse(raw); eq(r.ok, false, raw.slice(0, 30)); eq(r.code, code, raw.slice(0, 30)); });
  });
  t('after the game has ended further actions are rejected', () => {
    const { m, a, b, room } = setup(); for (let i = 1; i <= 2; i++) { sub(m, a, i, NOOP_W); sub(m, b, i, NOOP_B); }
    ok(room.state.result && room.state.result.type === 'draw'); eq(last(a, 'round_resolved').snapshot.game.result.code, 'THREEFOLD_REPETITION'); sub(m, a, 3, NOOP_W); eq(last(a, 'error').code, 'GAME_OVER'); deq(room.pending, [null, null]);
  });
  t('an occupied seat cannot be taken with the code alone; wrong or missing token fails', () => {
    const { m, code, tokA } = setup(), thief = conn(); m.handle(thief, { type: 'join_room', code }); eq(last(thief, 'error').code, 'ROOM_FULL');
    const bad = conn(); m.handle(bad, { type: 'resume_room', code, token: 'x'.repeat(32) }); eq(last(bad, 'error').code, 'BAD_TOKEN'); eq(bad.seat, null);
    eq(P.parse(JSON.stringify({ v: 1, type: 'resume_room', code })).code, 'INVALID_MESSAGE');   // token field missing eq(P.parse(JSON.stringify({ v: 1, type: 'resume_room', code, token: 'short' })).code, 'BAD_TOKEN');
    const unknown = conn(); m.handle(unknown, { type: 'resume_room', code: 'ZZZZZZ', token: tokA }); eq(last(unknown, 'error').code, 'ROOM_NOT_FOUND');
  });
  t('reconnect with the right token restores the seat and returns the snapshot; the old socket is replaced', () => {
    const { m, a, b, code, tokA, room } = setup(); sub(m, a, 1, W); const a2 = conn(); m.handle(a2, { type: 'resume_room', code, token: tokA });
    const r = last(a2, 'room_resumed'); eq(r.playerIndex, 0); eq(r.snapshot.seat.youLocked, true); eq(r.snapshot.seat.opponentLocked, false); ok(!choiceShaped(a2.out)); eq(a.closed, 4001); eq(a.seat, null); eq(room.seats[0].conn, a2);
    sub(m, b, 1, B); eq(last(a2, 'round_resolved').round, 1);
  });
  t('disconnect keeps the room and the game; the opponent only sees a connection status', () => {
    const { m, a, b, code, room } = setup(); sub(m, a, 1, W); const before = JSON.stringify(room.state); m.disconnect(a);
    ok(m.rooms.has(code)); eq(JSON.stringify(room.state), before); deq(room.pending[0], W); eq(last(b, 'lobby_update').opponentConnected, false); ok(!choiceShaped(b.out)); eq(m.sweep(), 0); ok(m.rooms.has(code));
  });
  t('snapshot after reconnect equals the server state after a completed round', () => {
    const { m, a, b, code, tokB, room } = setup(); sub(m, a, 1, W); sub(m, b, 1, B); m.disconnect(b); const b2 = conn(); m.handle(b2, { type: 'resume_room', code, token: tokB }); const g = last(b2, 'room_resumed').snapshot.game, s = room.state;
    deq(g, { version: s.version, round: s.round, edges: s.edges, streak: s.streak, rounds: s.rounds, result: s.result }); eq(g.rounds.length, 1); deq(g.rounds[0].choices, [W, B]);
  });
  t('two rooms are independent', () => {
    const r1 = setup(), r2 = setup(); sub(r1.m, r1.a, 1, W); sub(r1.m, r1.b, 1, B); eq(r1.room.state.round, 2); eq(setup().room.state.round, 1);
    const m = new RoomManager(), a1 = conn(), b1 = conn(), a2 = conn(), b2 = conn(); m.handle(a1, { type: 'create_room' }); m.handle(a2, { type: 'create_room' });
    const c1 = last(a1, 'room_created').code, c2 = last(a2, 'room_created').code; m.handle(b1, { type: 'join_room', code: c1 }); m.handle(b2, { type: 'join_room', code: c2 });
    sub(m, a1, 1, W); sub(m, b1, 1, B); eq(m.rooms.get(c1).state.round, 2); eq(m.rooms.get(c2).state.round, 1); deq(m.rooms.get(c2).pending, [null, null]); eq(a2.out.some(x => x.type === 'round_resolved'), false);
  });
  t('cleanup: abandoned rooms expire after the TTL (not instantly); room cap is enforced', () => {
    let now = 1000; const m = new RoomManager({ now: () => now, disconnectTtlMs: 5000, roomTtlMs: 1e9, maxRooms: 2 }), a = conn(), x = conn(); m.handle(a, { type: 'create_room' }); const code = last(a, 'room_created').code;
    m.disconnect(a); now += 4000; eq(m.sweep(), 0); ok(m.rooms.has(code)); m.handle(x, { type: 'resume_room', code, token: last(a, 'room_created').token }); eq(last(x, 'room_resumed').code, code); m.disconnect(x); now += 4000; eq(m.sweep(), 0); now += 2000; eq(m.sweep(), 1); ok(!m.rooms.has(code));
    const c1 = conn(), c2 = conn(), c3 = conn(); m.handle(c1, { type: 'create_room' }); m.handle(c2, { type: 'create_room' }); m.handle(c3, { type: 'create_room' }); eq(last(c3, 'error').code, 'SERVER_BUSY');
  });
  t('rate limiter allows a burst up to the limit and recovers after the window', () => {
    let t0 = 0; const L = P.createLimiter({ max: 3, windowMs: 1000, now: () => t0 }); ok(L.allow() && L.allow() && L.allow()); eq(L.allow(), false); t0 = 1001; eq(L.allow(), true);
  });
  t('internal errors never leak stack traces', () => {
    const m = new RoomManager(), a = conn(); m.handle(a, { type: 'create_room' }); const room = [...m.rooms.values()][0]; room.state = null; m.handle(a, { type: 'request_snapshot' });
    const e = last(a, 'error'); eq(e.code, 'INTERNAL'); ok(!/at |\.js:|Error/.test(JSON.stringify(e)), JSON.stringify(e));
  });
  return results;
};
