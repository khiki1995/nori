(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {})['online-client'] = f; })(this, function (N, H) {
const { suite, eq, deq, ok, C } = H, { results, t } = suite(), O = N.online;
class FakeWS { constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this); } send(s) { this.sent.push(JSON.parse(s)); } close() { this.readyState = 3; } open() { this.readyState = 1; this.onopen && this.onopen(); } recv(o) { this.onmessage && this.onmessage({ data: JSON.stringify(Object.assign({ v: 1 }, o)) }); } drop(code) { this.readyState = 3; this.onclose && this.onclose({ code }); } }
const mkStorage = () => { const m = {}; return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const setup = (loc) => { FakeWS.all = []; const timers = []; const st = mkStorage(), c = O.createClient({ WebSocket: FakeWS, storage: st, location: loc || { protocol: 'http:', host: 'localhost:3000' }, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {}, random: () => 0 }); return { c, st, timers, ws: () => FakeWS.all[FakeWS.all.length - 1] }; };
const snap = (o) => Object.assign({ code: 'ABCDEF', game: { version: 1, round: 1, edges: N.C.RING.slice(), streak: [0, 0], rounds: [], result: null }, seat: { index: 0, youLocked: false, opponentLocked: false, opponentPresent: true, opponentConnected: true } }, o);
const shaped = o => !!o && typeof o === 'object' && (('node' in o && 'action' in o && 'edge' in o) || Object.values(o).some(shaped));
const ready = (S, idx = 0) => { S.c.createRoom(); S.ws().open(); S.ws().recv({ type: idx ? 'room_joined' : 'room_created', code: 'ABCDEF', playerIndex: idx, token: 'T'.repeat(32), snapshot: snap({ seat: { index: idx, youLocked: false, opponentLocked: false, opponentPresent: true, opponentConnected: true } }) }); };
t('ws URL: ws: locally, wss: on https, none for file://', () => { eq(O.wsUrl({ protocol: 'http:', host: 'localhost:3000' }), 'ws://localhost:3000/ws'); eq(O.wsUrl({ protocol: 'https:', host: 'nori.example' }), 'wss://nori.example/ws'); eq(O.wsUrl({ protocol: 'file:', host: '' }), null); });
t('under file:// online is unavailable and nothing is opened', () => { const S = setup({ protocol: 'file:', host: '' }); eq(S.c.createRoom(), false); eq(S.c.getModel().error, 'UNAVAILABLE'); eq(FakeWS.all.length, 0); });
t('create room: sends create_room, becomes connected only after the server confirms, stores only the token per room code', () => {
  const S = setup(); S.c.createRoom(); eq(S.c.getModel().status, 'connecting'); S.ws().open(); deq(S.ws().sent, [{ v: 1, type: 'create_room' }]); eq(S.c.getModel().status, 'connecting', 'not connected before server confirmation');
  S.ws().recv({ type: 'room_created', code: 'ABCDEF', playerIndex: 0, token: 'T'.repeat(32), snapshot: snap() }); const m = S.c.getModel(); eq(m.status, 'connected'); eq(m.code, 'ABCDEF'); eq(m.playerIndex, 0);
  const stored = JSON.parse(S.st.m[O.KEY]); deq(stored.tokens, { ABCDEF: 'T'.repeat(32) }); deq(Object.keys(stored).sort(), ['last', 'tokens']); ok(!JSON.stringify(m).includes('TTTT'), 'token must not live in the model');
});
t('join: code is normalized; an existing seat token makes join a resume', () => {
  const S = setup(); S.c.joinRoom(' abcdef '); S.ws().open(); deq(S.ws().sent, [{ v: 1, type: 'join_room', code: 'ABCDEF' }]);
  const S2 = setup(); S2.st.setItem(O.KEY, JSON.stringify({ tokens: { ABCDEF: 'K'.repeat(32) }, last: null })); S2.c.joinRoom('abcdef'); S2.ws().open(); deq(S2.ws().sent, [{ v: 1, type: 'resume_room', code: 'ABCDEF', token: 'K'.repeat(32) }]);
});
t('submit: sends exactly {round, choice{node,action,edge}} once; no committed flag; the local view shows no trace of the choice', () => {
  const S = setup(); ready(S); const ch = C(3, 'CUT', '2-3'); eq(S.c.submitChoice(ch), true); deq(S.ws().sent[1], { v: 1, type: 'submit_choice', round: 1, choice: ch }); ok(!('committed' in S.ws().sent[1].choice)); eq(S.c.submitChoice(C(5, 'CREATE', '5-10')), false); eq(S.ws().sent.length, 2);
  const v = S.c.makeView(); eq(v.phase, 'waiting'); ok(!shaped(v), 'view must not contain a choice'); ok(!JSON.stringify(v).includes('CUT')); deq(v.hasPending, [true, false]);
  S.ws().recv({ type: 'choice_locked', round: 1 }); eq(S.c.getModel().youLocked, true); eq(S.c.getModel().sending, false); eq(S.c.makeView().phase, 'waiting');
});
t('opponent_status only flips a boolean in the view', () => { const S = setup(); ready(S); S.ws().recv({ type: 'opponent_status', round: 1, opponentLocked: true }); const v = S.c.makeView(); deq(v.hasPending, [false, true]); eq(v.phase, 'pick'); ok(!shaped(v)); });
t('round_resolved shows both choices (reveal), then ackReveal returns to picking without touching the server', () => {
  const S = setup(); ready(S); S.c.submitChoice(C(3, 'CUT', '2-3')); S.ws().recv({ type: 'choice_locked', round: 1 });
  const rec = N.state.playRound(N.state.createInitialState(), [C(3, 'CUT', '2-3'), C(8, 'CREATE', '3-8')]), g = { version: 1, round: rec.round, edges: rec.edges, streak: rec.streak, rounds: rec.rounds, result: null };
  S.ws().recv({ type: 'round_resolved', round: 1, choices: rec.rounds[0].choices, record: rec.rounds[0], snapshot: snap({ game: g }) }); let v = S.c.makeView(); eq(v.phase, 'reveal'); deq(v.lastRound.choices, [C(3, 'CUT', '2-3'), C(8, 'CREATE', '3-8')]); eq(v.round, 2);
  const sent = S.ws().sent.length; S.c.ackReveal(); v = S.c.makeView(); eq(v.phase, 'pick'); eq(S.ws().sent.length, sent); eq(v.canUndo, false); eq(v.mode, 'online');
});
t('lobby phase until the opponent is present; picking is refused meanwhile', () => {
  const S = setup(); S.c.createRoom(); S.ws().open(); S.ws().recv({ type: 'room_created', code: 'ABCDEF', playerIndex: 0, token: 'T'.repeat(32), snapshot: snap({ seat: { index: 0, youLocked: false, opponentLocked: false, opponentPresent: false, opponentConnected: false } }) });
  eq(S.c.makeView().phase, 'lobby'); eq(S.c.submitChoice(C(1, 'CUT', '1-2')), false); S.ws().recv({ type: 'lobby_update', code: 'ABC234', you: 0, opponentPresent: true, opponentConnected: true }); eq(S.c.makeView().phase, 'pick');
});
t('finished game: view phase is over and shows the result', () => { const S = setup(); ready(S); const r = { type: 'draw', winner: null, loser: null, code: 'THREEFOLD_REPETITION', reason: 'threefold_repetition' }; S.ws().recv({ type: 'snapshot', snapshot: snap({ game: { version: 1, round: 3, edges: N.C.RING.slice(), streak: [0, 0], rounds: [{ round: 1, choices: [C(1, 'CREATE', '1-2'), C(5, 'CREATE', '5-6')], commitments: [true, true], events: [], changes: [] }], result: r } }) }); const v = S.c.makeView(); eq(v.phase, 'over'); eq(v.result.code, 'THREEFOLD_REPETITION'); eq(S.c.submitChoice(C(1, 'CUT', '1-2')), false); });
t('connection loss: reconnecting with exponential backoff, resume with the stored token, "connected" only after the server confirms', () => {
  const S = setup(); ready(S); const first = S.ws(); first.drop(); eq(S.c.getModel().status, 'reconnecting'); eq(S.c.getModel().active, true); deq(S.timers.map(x => x.ms), [1000]);
  S.timers.shift().fn(); const sock2 = S.ws(); ok(sock2 !== first); sock2.open(); deq(sock2.sent, [{ v: 1, type: 'resume_room', code: 'ABCDEF', token: 'T'.repeat(32) }]); eq(S.c.getModel().status, 'reconnecting', 'not connected until the server answers');
  sock2.drop(); S.timers.shift().fn(); S.ws().drop(); deq(S.timers.map(x => x.ms), [4000]); S.timers.shift().fn(); S.ws().drop(); eq(S.timers[0].ms, 8000);
  S.timers.shift().fn(); S.ws().open(); S.ws().recv({ type: 'room_resumed', code: 'ABCDEF', playerIndex: 0, snapshot: snap() }); eq(S.c.getModel().status, 'connected'); eq(S.c.getModel().attempts, 0);
});
t('reconnect attempts are capped; the delay never exceeds 30 s; retry() starts again', () => {
  const S = setup(); ready(S); S.ws().drop(); const delays = []; for (let i = 0; i < O.MAX_ATTEMPTS; i++) { delays.push(S.timers[0].ms); S.timers.shift().fn(); S.ws().drop(); }
  eq(delays.length, 8); ok(Math.max(...delays) <= 30000); eq(delays[0], 1000); eq(delays[5], 30000); eq(S.c.getModel().status, 'failed'); eq(S.timers.length, 0); eq(S.c.retry(), true); eq(S.c.getModel().attempts, 0); eq(S.ws().readyState, 0);
});
t('resume into a vanished room: token is deleted, user returns to local mode with the error code', () => {
  const S = setup(); S.st.setItem(O.KEY, JSON.stringify({ tokens: { ABCDEF: 'K'.repeat(32) }, last: 'ABCDEF' })); eq(S.c.resumeSaved(), true); S.ws().open(); S.ws().recv({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' });
  const m = S.c.getModel(); eq(m.active, false); eq(m.error, 'ROOM_NOT_FOUND'); deq(JSON.parse(S.st.m[O.KEY]), { tokens: {}, last: null });
});
t('create/join refused by the server returns to idle with the error', () => { const S = setup(); S.c.joinRoom('ZZZZZZ'); S.ws().open(); S.ws().recv({ type: 'error', code: 'ROOM_NOT_FOUND' }); eq(S.c.getModel().active, false); eq(S.c.getModel().error, 'ROOM_NOT_FOUND'); });
t('first connection failure does not loop forever', () => { const S = setup(); S.c.createRoom(); S.ws().drop(); eq(S.c.getModel().status, 'failed'); eq(S.c.getModel().active, false); eq(S.timers.length, 0); });
t('leave closes the socket without reconnecting and forgets the last room (tokens stay for rejoining)', () => {
  const S = setup(); ready(S); const w = S.ws(); S.c.leave(); eq(w.readyState, 3); eq(S.timers.length, 0); eq(S.c.getModel().active, false); eq(JSON.parse(S.st.m[O.KEY]).last, null); eq(JSON.parse(S.st.m[O.KEY]).tokens.ABCDEF.length, 32); eq(S.c.hasSavedRoom(), false);
});
t('ROUND_MISMATCH triggers a snapshot request; unavailable storage never throws', () => {
  const S = setup(); ready(S); S.ws().recv({ type: 'error', code: 'ROUND_MISMATCH', round: 4 }); eq(S.ws().sent[S.ws().sent.length - 1].type, 'request_snapshot');
  FakeWS.all = []; const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }; const c = O.createClient({ WebSocket: FakeWS, storage: bad, location: { protocol: 'http:', host: 'h' }, setTimeout: () => 1, clearTimeout: () => {} }); c.createRoom(); FakeWS.all[0].open(); FakeWS.all[0].recv({ type: 'room_created', code: 'ABCDEF', playerIndex: 0, token: 'T'.repeat(32), snapshot: snap() }); eq(c.getModel().status, 'connected');
});
t('lobby_update (the server\'s flat format) updates the opponent status; 4001 "seat replaced" does NOT trigger reconnecting', () => {
  const S = setup(); S.c.createRoom(); S.ws().open(); S.ws().recv({ type: 'room_created', code: 'ABCDEF', playerIndex: 0, token: 'T'.repeat(32), snapshot: snap({ seat: { index: 0, youLocked: false, opponentLocked: false, opponentPresent: false, opponentConnected: false } }) });
  eq(S.c.makeView().phase, 'lobby'); S.ws().recv({ type: 'lobby_update', code: 'ABCDEF', you: 0, opponentPresent: true, opponentConnected: true }); eq(S.c.makeView().phase, 'pick'); eq(S.c.getModel().opponentConnected, true);
  S.ws().recv({ type: 'lobby_update', code: 'ABCDEF', you: 0, opponentPresent: true, opponentConnected: false }); eq(S.c.getModel().opponentConnected, false);
  const n = FakeWS.all.length; S.ws().drop(4001); eq(S.timers.length, 0, 'no reconnect timer after replacement'); eq(FakeWS.all.length, n); eq(S.c.getModel().active, false); eq(S.c.getModel().error, 'REPLACED');
});
t('makeView exposes online.youLocked only after the SERVER confirmed the lock (sending alone does not count)', () => {
  const S = setup(); ready(S); eq(S.c.makeView().online.youLocked, false); S.c.submitChoice({ node: 3, action: 'CUT', edge: '2-3' });
  const sending = S.c.makeView(); eq(sending.online.youLocked, false, 'must stay false while only sending'); eq(sending.phase, 'waiting'); eq(sending.hasPending[sending.turn], true);
  S.ws().recv({ type: 'choice_locked', round: 1 }); const locked = S.c.makeView(); eq(locked.online.youLocked, true); eq(locked.phase, 'waiting');
  S.ws().recv({ type: 'round_resolved', round: 1, choices: [], record: { round: 1, choices: [], commitments: [], events: [], changes: [], edgesAfter: N.C.RING.slice(), streakAfter: [0, 0], beaconsAfter: [[true, true], [true, true]], result: null }, snapshot: snap({ game: { version: 1, round: 2, edges: N.C.RING.slice(), streak: [0, 0], rounds: [{ round: 1, choices: [], commitments: [], events: [], changes: [], edgesAfter: N.C.RING.slice(), streakAfter: [0, 0], beaconsAfter: [[true, true], [true, true]], result: null }], result: null } }) });
  eq(S.c.makeView().online.youLocked, false, 'the lock is cleared when the round resolves');
});
t('makeView before any snapshot is a neutral "connecting" view', () => { const S = setup(); const v = S.c.makeView(); eq(v.phase, 'connecting'); deq(v.edges, N.C.RING); eq(v.rounds.length, 0); });
return results;
});
