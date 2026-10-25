'use strict';
// Transport-independent room logic. The authoritative game state lives here and advances ONLY through NORI.state.playRound.
// A "conn" is any object with send(obj) and close(code, reason) and a mutable `seat` field (set here).
const crypto = require('crypto'), path = require('path');
['constants', 'graph', 'rules', 'state'].forEach(f => require(path.join(__dirname, '..', 'src', f + '.js')));
const N = globalThis.NORI, P = require('./protocol.js');
const sha = s => crypto.createHash('sha256').update(s).digest();
const ERR_MSG = { BAD_JSON: 'Malformed message.', TOO_LARGE: 'Message too large.', INVALID_MESSAGE: 'Invalid message.', UNKNOWN_TYPE: 'Unknown message type.', BAD_CODE: 'Invalid room code.', ROOM_NOT_FOUND: 'The room no longer exists. Create a new one.',
  ROOM_FULL: 'The room already has two players.', BAD_TOKEN: 'Could not restore the seat.', ALREADY_IN_ROOM: 'Already in a room.', NOT_IN_ROOM: 'Not in a room.', OPPONENT_MISSING: 'Waiting for the second player.',
  ROUND_MISMATCH: 'The round has changed.', GAME_OVER: 'The game is over.', DUPLICATE_CHOICE: 'A choice is already locked this round.', INVALID_CHOICE: 'Invalid choice.', RATE_LIMITED: 'Too many messages.', SERVER_BUSY: 'The server is busy.', INTERNAL: 'Server error.' };

class RoomManager {
  constructor(o = {}) {
    this.now = o.now || Date.now; this.maxRooms = o.maxRooms || 500; this.disconnectTtlMs = o.disconnectTtlMs || 30 * 60e3; this.roomTtlMs = o.roomTtlMs || 6 * 3600e3;
    this.randomInt = o.randomInt || crypto.randomInt; this.randomBytes = o.randomBytes || crypto.randomBytes; this.rooms = new Map();
    // Optional account hooks: identify(authToken) -> userId|null; onRated(userIdWhite, userIdBlack, scoreWhite) once per finished game.
    this.identify = o.identify || (() => null); this.onRated = o.onRated || null;
  }
  send(conn, obj) { try { conn.send(Object.assign({ v: P.VERSION }, obj)); } catch (e) { /* a dead socket must not break room logic */ } }
  error(conn, code, extra) { this.send(conn, Object.assign({ type: 'error', code, message: ERR_MSG[code] || ERR_MSG.INTERNAL }, extra || {})); }
  newCode() {
    for (let a = 0; a < 50; a++) { let c = ''; for (let i = 0; i < 6; i++) c += P.CODE_ALPHABET[this.randomInt(P.CODE_ALPHABET.length)]; if (!this.rooms.has(c)) return c; }
    return null;
  }
  newToken() { return this.randomBytes(24).toString('base64url'); }
  // Public view for one seat. Never contains pending choices: only booleans about whether a choice is locked.
  snapshot(room, i) {
    const st = room.state, other = room.seats[1 - i];
    return { code: room.code, game: { version: st.version, round: st.round, edges: st.edges, streak: st.streak, rounds: st.rounds, result: st.result },
      seat: { index: i, youLocked: !!room.pending[i], opponentLocked: !!room.pending[1 - i], opponentPresent: !!other, opponentConnected: !!(other && other.conn) } };
  }
  lobby(room) { room.seats.forEach((s, i) => { if (s && s.conn) this.send(s.conn, { type: 'lobby_update', code: room.code, you: i, opponentPresent: !!room.seats[1 - i], opponentConnected: !!(room.seats[1 - i] && room.seats[1 - i].conn) }); }); }
  bind(conn, room, i) { const seat = room.seats[i]; seat.conn = conn; seat.disconnectedAt = null; conn.seat = { room, index: i }; room.allDisconnectedAt = null; room.lastActivity = this.now(); }

  handle(conn, msg) {
    try {
      switch (msg.type) {
        case 'create_room': return this.create(conn, msg.auth);
        case 'join_room': return this.join(conn, msg.code, msg.auth);
        case 'resume_room': return this.resume(conn, msg.code, msg.token);
        case 'submit_choice': return this.submit(conn, msg.round, msg.choice);
        case 'request_snapshot': return conn.seat ? this.send(conn, { type: 'snapshot', snapshot: this.snapshot(conn.seat.room, conn.seat.index) }) : this.error(conn, 'NOT_IN_ROOM');
        default: return this.error(conn, 'UNKNOWN_TYPE');
      }
    } catch (e) { this.error(conn, 'INTERNAL'); } // never leak internals or stack traces
  }
  userIdFor(auth) { if (!auth) return null; try { return this.identify(auth) || null; } catch (e) { return null; } }
  create(conn, auth) {
    if (conn.seat) return this.error(conn, 'ALREADY_IN_ROOM');
    if (this.rooms.size >= this.maxRooms) return this.error(conn, 'SERVER_BUSY');
    const code = this.newCode(); if (!code) return this.error(conn, 'SERVER_BUSY');
    const token = this.newToken(), room = { code, seats: [{ hash: sha(token), conn: null, disconnectedAt: null, userId: this.userIdFor(auth) }, null], state: N.state.createInitialState(), pending: [null, null], created: this.now(), lastActivity: this.now(), allDisconnectedAt: null };
    this.rooms.set(code, room); this.bind(conn, room, 0);
    this.send(conn, { type: 'room_created', code, playerIndex: 0, token, snapshot: this.snapshot(room, 0) });
  }
  join(conn, code, auth) {
    if (conn.seat) return this.error(conn, 'ALREADY_IN_ROOM');
    const room = this.rooms.get(code); if (!room) return this.error(conn, 'ROOM_NOT_FOUND');
    if (room.seats[1]) return this.error(conn, 'ROOM_FULL');   // an occupied seat can only be reclaimed with its token
    const token = this.newToken(); room.seats[1] = { hash: sha(token), conn: null, disconnectedAt: null, userId: this.userIdFor(auth) }; this.bind(conn, room, 1);
    this.send(conn, { type: 'room_joined', code, playerIndex: 1, token, snapshot: this.snapshot(room, 1) }); this.lobby(room);
  }
  resume(conn, code, token) {
    if (conn.seat) return this.error(conn, 'ALREADY_IN_ROOM');
    const room = this.rooms.get(code); if (!room) return this.error(conn, 'ROOM_NOT_FOUND');
    const h = sha(token), i = room.seats.findIndex(s => s && crypto.timingSafeEqual(s.hash, h)); if (i < 0) return this.error(conn, 'BAD_TOKEN');
    const old = room.seats[i].conn; if (old && old !== conn) { old.seat = null; try { old.close(4001, 'replaced'); } catch (e) { /* ignore */ } }
    this.bind(conn, room, i); this.send(conn, { type: 'room_resumed', code, playerIndex: i, snapshot: this.snapshot(room, i) }); this.lobby(room);
  }
  submit(conn, round, choice) {
    const seat = conn.seat; if (!seat) return this.error(conn, 'NOT_IN_ROOM');
    const { room, index } = seat, st = room.state;
    if (!room.seats[1]) return this.error(conn, 'OPPONENT_MISSING');
    if (st.result) return this.error(conn, 'GAME_OVER');
    if (round !== st.round) return this.error(conn, 'ROUND_MISMATCH', { round: st.round });
    if (room.pending[index]) return this.error(conn, 'DUPLICATE_CHOICE');
    try { N.rules.validateChoice(choice); } catch (e) { return this.error(conn, 'INVALID_CHOICE'); }   // commitment is computed by the rules, never taken from the client
    room.pending[index] = { node: choice.node, action: choice.action, edge: choice.edge }; room.lastActivity = this.now();
    this.send(conn, { type: 'choice_locked', round });
    const other = room.seats[1 - index]; if (other && other.conn) this.send(other.conn, { type: 'opponent_status', round, opponentLocked: true });
    if (!(room.pending[0] && room.pending[1])) return;
    const next = N.state.playRound(st, [room.pending[0], room.pending[1]]);   // exactly one authoritative transition
    room.state = next; room.pending = [null, null]; const rec = next.rounds[next.rounds.length - 1];
    if (next.result) this.rate(room);
    room.seats.forEach((s, i) => { if (s && s.conn) this.send(s.conn, { type: 'round_resolved', round: rec.round, choices: rec.choices, record: rec, snapshot: this.snapshot(room, i) }); });
  }
  // A game between two different signed-in accounts updates both ratings exactly once.
  rate(room) {
    const [w, b] = room.seats.map(s => s && s.userId), res = room.state.result;
    if (!this.onRated || room.rated || !w || !b || w === b || !res) return;
    room.rated = true; const scoreW = res.type === 'draw' ? 0.5 : res.winner === 0 ? 1 : 0;
    try { this.onRated(w, b, scoreW); } catch (e) { /* rating storage failure must not break the game */ }
  }
  disconnect(conn) {
    const seat = conn.seat; if (!seat) return; conn.seat = null;
    const s = seat.room.seats[seat.index]; if (!s || s.conn !== conn) return;   // already replaced by a newer connection
    s.conn = null; s.disconnectedAt = this.now(); const room = seat.room;
    if (room.seats.every(x => !x || !x.conn)) room.allDisconnectedAt = this.now();
    this.lobby(room);   // pending choices stay on the server and are never revealed
  }
  sweep() {
    const t = this.now(); let n = 0;
    for (const [code, room] of this.rooms) {
      const stale = t - room.lastActivity > this.roomTtlMs, abandoned = room.allDisconnectedAt !== null && t - room.allDisconnectedAt > this.disconnectTtlMs;
      if (!stale && !abandoned) continue;
      room.seats.forEach(s => { if (s && s.conn) { const c = s.conn; this.error(c, 'ROOM_NOT_FOUND'); c.seat = null; try { c.close(4002, 'expired'); } catch (e) { /* ignore */ } } });
      this.rooms.delete(code); n++;
    }
    return n;
  }
}
module.exports = { RoomManager, ERR_MSG };
