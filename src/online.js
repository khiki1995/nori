// Online client: WebSocket session, reconnect with exponential backoff, per-room seat tokens, and a pure makeView() adapter
// that turns the server's PUBLIC snapshot into the same view shape the local UI already renders. The server is the only source of truth.
(function (G) {
'use strict';
const N = G.NORI, V = 1, KEY = 'nori.online.v1', MAX_ATTEMPTS = 8;
const FATAL_ON_RESUME = ['ROOM_NOT_FOUND', 'BAD_TOKEN', 'BAD_CODE'];
// Only the seat token (per room code) and the last room code are stored. No game state, no choices.
function loadStore(st) { try { const d = JSON.parse(st.getItem(KEY) || '{}'); return { tokens: d.tokens && typeof d.tokens === 'object' ? d.tokens : {}, last: typeof d.last === 'string' ? d.last : null }; } catch (e) { return { tokens: {}, last: null }; } }
function saveStore(st, d) { try { st.setItem(KEY, JSON.stringify(d)); } catch (e) { /* storage unavailable: playing still works, only seat recovery after reload is lost */ } }
function wsUrl(loc) { if (!loc || !loc.host || !/^https?:$/.test(loc.protocol)) return null; return (loc.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + loc.host + '/ws'; }
const normCode = s => (typeof s === 'string' ? s.trim().toUpperCase() : '');

function makeView(m) {
  const g = m.game || N.state.createInitialState(), rounds = g.rounds || [], last = rounds.length ? rounds[rounds.length - 1] : null, ack = m.ackRounds == null ? rounds.length : m.ackRounds;
  let phase;
  if (!m.game) phase = 'connecting';
  else if (g.result) phase = 'over';
  else if (rounds.length > ack) phase = 'reveal';
  else if (!m.opponentPresent && rounds.length === 0) phase = 'lobby';
  else if (m.youLocked || m.sending) phase = 'waiting';
  else phase = 'pick';
  const idx = m.playerIndex == null ? 0 : m.playerIndex, hp = [false, false]; hp[idx] = !!(m.youLocked || m.sending); hp[1 - idx] = !!m.opponentLocked;
  return { mode: 'online', phase, turn: idx, round: g.round, edges: g.edges.slice(), streak: g.streak.slice(), beacons: [0, 1].map(p => N.rules.getBeaconStatus(g.edges, p)),
    rounds, result: g.result || null, hasPending: hp, canUndo: false, lastRound: phase === 'reveal' || phase === 'over' ? last : null,
    online: { status: m.status, code: m.code, playerIndex: idx, youLocked: !!m.youLocked, opponentPresent: !!m.opponentPresent, opponentConnected: !!m.opponentConnected, attempts: m.attempts } };
}

function createClient(deps) {
  const WS = deps.WebSocket, st = deps.storage, loc = deps.location, setT = deps.setTimeout || setTimeout, clrT = deps.clearTimeout || clearTimeout, rnd = deps.random || Math.random;
  const fresh = () => ({ status: 'idle', active: false, code: null, playerIndex: null, game: null, youLocked: false, sending: false, opponentLocked: false, opponentPresent: false, opponentConnected: false, ackRounds: null, error: null, attempts: 0 });
  let model = fresh(), ws = null, timer = null, closedByUs = false, hadRoom = false, mode = null; const listeners = [];
  const store = () => (st ? loadStore(st) : { tokens: {}, last: null });
  // Signed-in players send their account token with create/join so the server can rate the finished game.
  const withAuth = o => { let a = ''; try { a = st ? st.getItem('nori.account.token.v1') || '' : ''; } catch (e) { /* storage off */ } return /^[A-Za-z0-9_-]{16,200}$/.test(a) ? Object.assign(o, { auth: a }) : o; };
  const emit = () => listeners.forEach(f => f(model));
  const send = o => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(Object.assign({ v: V }, o))); return true; } return false; };
  const dropSocket = () => { closedByUs = true; if (ws) { try { ws.close(); } catch (e) { /* ignore */ } ws = null; } if (timer) { clrT(timer); timer = null; } };
  function applySeat(s) { model.youLocked = !!s.youLocked; model.opponentLocked = !!s.opponentLocked; model.opponentPresent = !!s.opponentPresent; model.opponentConnected = !!s.opponentConnected; }
  function applySnapshot(s) { model.game = s.game; applySeat(s.seat); }
  function abandon(code) { dropSocket(); hadRoom = false; model.active = false; model.status = 'idle'; model.error = code; const d = store(); if (model.code) { delete d.tokens[model.code]; } d.last = null; if (st) saveStore(st, d); model.code = null; model.game = null; model.playerIndex = null; emit(); }
  function handle(raw) {
    let msg; try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || msg.v !== V) return;
    switch (msg.type) {
      case 'room_created': case 'room_joined': {
        hadRoom = true; model.code = msg.code; model.playerIndex = msg.playerIndex; applySnapshot(msg.snapshot); model.ackRounds = model.game.rounds.length; model.status = 'connected'; model.attempts = 0; model.error = null;
        const d = store(); d.tokens[msg.code] = msg.token; d.last = msg.code; if (st) saveStore(st, d); break;
      }
      case 'room_resumed': {
        hadRoom = true; model.code = msg.code; model.playerIndex = msg.playerIndex; applySnapshot(msg.snapshot);
        model.ackRounds = model.ackRounds == null ? model.game.rounds.length : Math.min(model.ackRounds, model.game.rounds.length); model.status = 'connected'; model.attempts = 0; model.error = null; model.sending = false;
        const d = store(); d.last = msg.code; if (st) saveStore(st, d); break;
      }
      case 'lobby_update': model.opponentPresent = !!msg.opponentPresent; model.opponentConnected = !!msg.opponentConnected; break;   // flat format, same as the server
      case 'snapshot': applySnapshot(msg.snapshot); break;
      case 'choice_locked': model.youLocked = true; model.sending = false; break;
      case 'opponent_status': model.opponentLocked = !!msg.opponentLocked; break;
      case 'round_resolved': applySnapshot(msg.snapshot); model.sending = false; break;
      case 'error': {
        model.sending = false; model.error = msg.code;
        if (mode === 'resume' && model.status !== 'connected' && FATAL_ON_RESUME.includes(msg.code)) return abandon(msg.code);
        if (model.status !== 'connected') { dropSocket(); model.active = false; model.status = 'idle'; }   // create/join refused
        else if (msg.code === 'ROUND_MISMATCH') send({ type: 'request_snapshot' });
        break;
      }
      default: return;
    }
    emit();
  }
  // The server closes a socket with 4001 when the same seat token connects elsewhere: do NOT fight back by reconnecting.
  function replaced() { hadRoom = false; model.active = false; model.status = 'idle'; model.error = 'REPLACED'; model.game = null; model.code = null; model.playerIndex = null; emit(); }
  function onClosed() {
    if (closedByUs) return;
    if (hadRoom || mode === 'resume') {            // we own a seat: keep trying with exponential backoff
      model.attempts++;
      if (model.attempts > MAX_ATTEMPTS) { model.status = 'failed'; emit(); return; }
      model.status = 'reconnecting'; emit();
      const delay = Math.min(30000, 1000 * Math.pow(2, model.attempts - 1)) + Math.floor(rnd() * 250);
      timer = setT(() => { timer = null; resumeNow(); }, delay);
    } else { model.status = 'failed'; model.active = false; model.error = 'CONNECTION'; emit(); }
  }
  function open(first, m) {
    const url = wsUrl(loc); if (!url) { model.error = 'UNAVAILABLE'; emit(); return false; }
    mode = m; closedByUs = false; model.active = true; model.status = hadRoom ? 'reconnecting' : 'connecting'; model.error = null; emit();
    let sock; try { sock = new WS(url); } catch (e) { onClosed(); return false; }
    ws = sock; sock.onopen = () => { if (ws === sock) send(first); }; sock.onmessage = ev => { if (ws === sock) handle(ev.data); };
    sock.onclose = ev => { if (ws !== sock) return; ws = null; if (ev && ev.code === 4001) { replaced(); return; } onClosed(); }; sock.onerror = () => {};
    return true;
  }
  function resumeNow() { const tok = store().tokens[model.code]; if (!tok) return abandon('BAD_TOKEN'); open({ type: 'resume_room', code: model.code, token: tok }, 'resume'); }
  return {
    getModel: () => model, subscribe: f => { listeners.push(f); }, makeView: () => makeView(model), wsUrl: () => wsUrl(loc),
    createRoom() { if (model.active) return false; model = fresh(); hadRoom = false; return open(withAuth({ type: 'create_room' }), 'create'); },
    joinRoom(raw) {
      if (model.active) return false; const code = normCode(raw); model = fresh(); hadRoom = false;
      const tok = store().tokens[code]; if (tok) { model.code = code; return open({ type: 'resume_room', code, token: tok }, 'resume'); }   // we already own a seat here
      return open(withAuth({ type: 'join_room', code }), 'join');
    },
    resumeSaved() { const d = store(); if (!d.last || !d.tokens[d.last] || model.active) return false; model = fresh(); model.code = d.last; return open({ type: 'resume_room', code: d.last, token: d.tokens[d.last] }, 'resume'); },
    retry() { if (!model.code || model.status === 'connected') return false; model.attempts = 0; if (timer) { clrT(timer); timer = null; } if (ws) dropSocket(); resumeNow(); return true; },
    submitChoice(c) {
      if (model.status !== 'connected' || model.youLocked || model.sending || !model.game || model.game.result || !model.opponentPresent) return false;
      model.sending = true; const ok = send({ type: 'submit_choice', round: model.game.round, choice: { node: c.node, action: c.action, edge: c.edge } }); if (!ok) model.sending = false; emit(); return ok;
    },
    ackReveal() { if (model.game) { model.ackRounds = model.game.rounds.length; emit(); } },
    leave() { dropSocket(); hadRoom = false; const d = store(); d.last = null; if (st) saveStore(st, d); model = fresh(); emit(); },
    hasSavedRoom() { const d = store(); return !!(d.last && d.tokens[d.last]); }
  };
}
N.online = { createClient, makeView, wsUrl, KEY, MAX_ATTEMPTS, normCode };
})(typeof window !== 'undefined' ? window : globalThis);
