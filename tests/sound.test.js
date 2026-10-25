(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).sound = f; })(this, function (N, H, env) {
const { suite, eq, deq, ok, C } = H, { results, t } = suite(), S = N.sound, K = N.controller; env = env || {};
const mem = () => { const m = {}; return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
class FakeAudio {
  constructor(src) { FakeAudio.made++; this.src = src; this.volume = 1; this.preload = ''; this.paused = true; this.ended = false; this.currentTime = 0; FakeAudio.instances.push(this); }
  addEventListener() {}
  setAttribute() {}
  play() { FakeAudio.played.push(this.src); if (FakeAudio.reject) return Promise.reject(new Error('blocked')); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
const fresh = () => { FakeAudio.made = 0; FakeAudio.instances = []; FakeAudio.played = []; FakeAudio.reject = false; };
const stub = () => ({ calls: [], play(n, d) { this.calls.push(n); return true; } });
const NAMES = Object.keys(S.SOUNDS);
const view = s => K.getPublicView(s), choose = (s, w, b) => { K.submitChoice(s, w); K.proceedFromHandoff(s); K.submitChoice(s, b); };

t('all 17 distinct sound events exist', () => deq(NAMES.sort(), ['beacon', 'click', 'confirm', 'conflict', 'create', 'cut', 'draw', 'edgeCreated', 'edgeRemoved', 'error', 'join', 'leave', 'lose', 'netError', 'rejoin', 'reveal', 'win']));
t('muted: no audio objects are created and nothing is logged', () => {
  fresh(); const st = mem(), s = S.createSound({ storage: st, Audio: FakeAudio }); s.setEnabled(false);
  NAMES.forEach(n => eq(s.play(n), false, n)); eq(FakeAudio.made, 0, 'audio object created while muted'); eq(FakeAudio.played.length, 0); eq(s.history().length, 0);
});
t('volume 0 behaves like mute', () => { fresh(); const s = S.createSound({ storage: mem(), Audio: FakeAudio }); s.setVolume(0); eq(s.play('click'), false); eq(FakeAudio.made, 0); });
t('every event plays a local sound asset at a bounded volume and is logged', () => {
  fresh(); const s = S.createSound({ storage: mem(), Audio: FakeAudio });
  NAMES.forEach(n => { eq(s.play(n), true, n); const a = FakeAudio.instances[FakeAudio.instances.length - 1]; ok(a.src.includes('assets/sounds/nori-'), n + ' uses local path'); ok(a.src.endsWith('.wav'), n + ' has wav extension'); ok(a.volume > 0 && a.volume <= 1, n + ' volume'); });
  eq(FakeAudio.made, NAMES.length); eq(FakeAudio.played.length, NAMES.length); eq(s.history().length, NAMES.length); deq(s.history().map(x => x.name), NAMES);
});
t('unmuting after mute works; muting pauses active effects', () => { fresh(); const s = S.createSound({ storage: mem(), Audio: FakeAudio }); s.setEnabled(false); eq(s.play('click'), false); s.setEnabled(true); eq(s.play('click'), true); const a = FakeAudio.instances[0]; s.setEnabled(false); eq(a.paused, true); eq(s.play('click'), false); eq(s.history().length, 1); });
t('settings persist (enabled and volume) and malformed storage is ignored', () => {
  const st = mem(), a = S.createSound({ storage: st, Audio: FakeAudio }); a.setEnabled(false); a.setVolume(0.8); const b = S.createSound({ storage: st, Audio: FakeAudio }); deq(b.get(), { enabled: false, volume: 0.8 });
  a.setVolume(7); eq(a.get().volume, 1); a.setVolume(-3); eq(a.get().volume, 0); a.setVolume('x'); eq(a.get().volume, 0.5);
  const bad = mem(); bad.m[S.KEY] = '{not json'; deq(S.createSound({ storage: bad, Audio: FakeAudio }).get(), { enabled: true, volume: 0.58 });
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }; const c = S.createSound({ storage: broken, Audio: FakeAudio }); c.setEnabled(false); eq(c.get().enabled, false);
});
t('missing browser audio support never breaks the game', () => { eq(S.createSound({ storage: mem(), Audio: null }).play('click'), false); eq(S.createSound({ storage: mem(), Audio: FakeAudio }).play('nope'), false); });
t('a blocked browser playback is handled without throwing', () => { fresh(); FakeAudio.reject = true; const s = S.createSound({ storage: mem(), Audio: FakeAudio }); eq(s.play('confirm'), true); eq(FakeAudio.made, 1); });
t('sound module has no remote requests; every local audio asset exists', () => {
  if (!env.fs) return 'SKIP'; const src = env.fs.readFileSync(env.path.join(env.root, 'src', 'sound.js'), 'utf8');
  ['fetch(', 'XMLHttpRequest', 'WebSocket', 'http:', 'https:', 'import('].forEach(w => ok(!src.includes(w), w));
  NAMES.forEach(n => { const file = env.path.join(env.root, 'assets', 'sounds', S.SOUNDS[n]); ok(env.fs.existsSync(file), 'missing ' + n); const b = env.fs.readFileSync(file); ok(b.length > 1000 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE', 'invalid wave ' + n); });
  const click = env.fs.readFileSync(env.path.join(env.root, 'assets', 'sounds', S.SOUNDS.click));
  const peak = Array.from({ length: Math.floor((click.length - 44) / 2) }, (_, i) => Math.abs(click.readInt16LE(44 + i * 2))).reduce((m, x) => Math.max(m, x), 0) / 32768;
  ok(peak < 0.2, 'interface click waveform stays soft (peak < 0.2); actual=' + peak.toFixed(3));
});
t('feedback: the first view only sets a silent baseline; repeated observe of the same view never replays', () => {
  const sd = stub(), fb = S.createFeedback(sd), s = K.createSession('hvh'); choose(s, C(3, 'CUT', '2-3'), C(8, 'CREATE', '3-8')); const v = view(s);
  deq(fb.observe(v), []); for (let i = 0; i < 5; i++) deq(fb.observe(v), []); eq(sd.calls.length, 0);
});
t('feedback: a resolved round plays reveal, then create, then remove exactly once, however often it is re-rendered', () => {
  const sd = stub(), fb = S.createFeedback(sd), s = K.createSession('hvh'); fb.observe(view(s)); choose(s, C(3, 'CUT', '2-3'), C(8, 'CREATE', '3-8')); const v = view(s);
  deq(fb.observe(v), ['reveal', 'edgeCreated', 'edgeRemoved']); for (let i = 0; i < 6; i++) deq(fb.observe(v), []); deq(sd.calls, ['reveal', 'edgeCreated', 'edgeRemoved']);
});
t('feedback: a conflict round plays reveal then the conflict sound (and nothing for edges)', () => { const sd = stub(), fb = S.createFeedback(sd), s = K.createSession('hvh'); fb.observe(view(s)); choose(s, C(2, 'CREATE', '2-7'), C(7, 'CUT', '2-7')); deq(fb.observe(view(s)), ['reveal', 'conflict']); });
t('feedback: a round with no edge change plays only the reveal tone', () => { const sd = stub(), fb = S.createFeedback(sd), s = K.createSession('hvh'); fb.observe(view(s)); choose(s, C(1, 'CREATE', '1-2'), C(5, 'CREATE', '5-6')); deq(fb.observe(view(s)), ['reveal']); });
t('feedback: a full game gives a beacon tone at each real beacon change, then the result signature once (real engine, 6 rounds)', () => {
  const sd = stub(), fb = S.createFeedback(sd), s = K.createSession('hvh'); fb.observe(view(s)); const log = [];
  [C(5, 'CREATE', '5-10'), C(3, 'CUT', '3-4'), C(4, 'CUT', '4-5'), C(6, 'CUT', '6-7'), C(7, 'CUT', '7-8'), C(5, 'CREATE', '5-6')].forEach((b, i) => { choose(s, C(1, 'CREATE', '1-2'), b); log.push(fb.observe(view(s))); if (s.phase === 'reveal') K.nextRound(s); });
  eq(log.filter(x => x.includes('beacon')).length, 2, 'beacon 4 is cut off in round 3, beacon 7 in round 5'); ok(log[2].includes('beacon') && log[4].includes('beacon')); deq(log[5], ['reveal', 'win']); eq(sd.calls.filter(n => n === 'win').length, 1);
});
t('feedback: result signature depends on the viewer (hvh win, AI win/lose, online win/lose, draw)', () => {
  const s = K.createSession('hvh'); [C(5, 'CREATE', '5-10'), C(3, 'CUT', '3-4'), C(4, 'CUT', '4-5'), C(6, 'CUT', '6-7'), C(7, 'CUT', '7-8')].forEach(b => { choose(s, C(1, 'CREATE', '1-2'), b); K.nextRound(s); });
  const before = view(s); choose(s, C(1, 'CREATE', '1-2'), C(5, 'CREATE', '5-6')); const after = view(s); eq(after.result.winner, 1);
  const run = (b, a) => { const sd = stub(), fb = S.createFeedback(sd); fb.observe(b); fb.observe(a); return sd.calls.filter(n => ['win', 'lose', 'draw'].includes(n)); };
  deq(run(before, after), ['win']); deq(run(Object.assign({}, before, { mode: 'ai' }), Object.assign({}, after, { mode: 'ai' })), ['lose']);
  const on = (v, turn) => Object.assign({}, v, { mode: 'online', turn, online: { status: 'connected', code: 'ABCDEF', youLocked: false } });
  deq(run(on(before, 1), on(after, 1)), ['win']); deq(run(on(before, 0), on(after, 0)), ['lose']);
  const d = K.createSession('hvh'); const d0 = view(d); choose(d, C(1, 'CREATE', '1-2'), C(5, 'CREATE', '5-6')); K.nextRound(d); choose(d, C(1, 'CREATE', '1-2'), C(5, 'CREATE', '5-6')); deq(run(d0, view(d)), ['draw']);
});
t('feedback: undo, new game, or switching room only rebaselines silently', () => {
  const sd = stub(), fb = S.createFeedback(sd), s = K.createSession('hvh'); fb.observe(view(s)); choose(s, C(3, 'CUT', '2-3'), C(8, 'CREATE', '3-8')); fb.observe(view(s)); const n = sd.calls.length;
  K.undo(s); deq(fb.observe(view(s)), []); choose(s, C(3, 'CUT', '2-3'), C(8, 'CREATE', '3-8')); eq(fb.observe(view(s)).length, 3);
  const v = view(s), a = Object.assign({}, v, { mode: 'online', online: { status: 'connected', code: 'AAAAAA', youLocked: false } }), b = Object.assign({}, a, { rounds: a.rounds.concat([a.rounds[0]]), online: { status: 'connected', code: 'BBBBBB', youLocked: false } });
  fb.observe(a); deq(fb.observe(b), []); ok(sd.calls.length > n);
});
t('online: the confirm tone follows the server-confirmed lock, never the local click', () => {
  const sd = stub(), fb = S.createFeedback(sd), s = K.createSession('hvh'), mk = (locked, sending) => Object.assign({}, view(s), { mode: 'online', turn: 0, hasPending: [locked || sending, false], online: { status: 'connected', code: 'ABCDEF', youLocked: locked } });
  fb.observe(mk(false, false)); deq(fb.observe(mk(false, true)), [], 'sending (not yet confirmed) must be silent'); deq(fb.observe(mk(true, false)), ['confirm']); deq(fb.observe(mk(true, false)), []); deq(fb.observe(mk(true, false)), []);
});
t('online: the connection-error tone plays once per drop, not once per attempt or render', () => {
  const sd = stub(), fb = S.createFeedback(sd), s = K.createSession('hvh'), mk = st => Object.assign({}, view(s), { mode: 'online', turn: 0, online: { status: st, code: 'ABCDEF', youLocked: false } });
  fb.observe(mk('connected')); deq(fb.observe(mk('reconnecting')), ['netError']); deq(fb.observe(mk('reconnecting')), []); deq(fb.observe(mk('failed')), []); deq(fb.observe(mk('connected')), []); deq(fb.observe(mk('reconnecting')), ['netError']);
});
t('online: opponent join / disconnect / reconnect each play their own tone once, only while our connection is healthy', () => {
  const sd = stub(), fb = S.createFeedback(sd), s = K.createSession('hvh'), mk = (present, oconn, conn) => Object.assign({}, view(s), { mode: 'online', turn: 0, online: { status: conn || 'connected', code: 'ABCDEF', youLocked: false, opponentPresent: present, opponentConnected: oconn } });
  fb.observe(mk(false, false)); deq(fb.observe(mk(true, true)), ['join']); deq(fb.observe(mk(true, true)), []); deq(fb.observe(mk(true, false)), ['leave']); deq(fb.observe(mk(true, false)), []); deq(fb.observe(mk(true, true)), ['rejoin']);
  deq(fb.observe(mk(true, false, 'reconnecting')), ['netError'], 'while WE are reconnecting only the connection tone plays, not a stale opponent-leave'); deq(fb.observe(mk(true, true, 'connected')), []);
  const fb2 = S.createFeedback(stub()); deq(fb2.observe(mk(true, true)), [], 'joining a room that already has an opponent is silent (baseline)');
});
t('sounds stay silent in a hidden (background) tab and nothing is queued for later', () => {
  fresh(); let hidden = true; const snd = S.createSound({ storage: mem(), Audio: FakeAudio, isHidden: () => hidden });
  eq(snd.play('click'), false); eq(FakeAudio.made, 0); eq(FakeAudio.played.length, 0); hidden = false; eq(snd.play('click'), true); eq(FakeAudio.made, 1);
});
t('feedback with real audio assets requests transition effects once; muted requests none', () => {
  fresh(); const snd = S.createSound({ storage: mem(), Audio: FakeAudio }), fb = S.createFeedback(snd), s = K.createSession('hvh'); fb.observe(view(s)); choose(s, C(3, 'CUT', '2-3'), C(8, 'CREATE', '3-8')); const v = view(s);
  for (let i = 0; i < 10; i++) fb.observe(v); eq(snd.history().length, 1, 'reveal plays now; staggered effects are delayed'); for (let i = 0; i < 10; i++) fb.observe(v); eq(snd.history().length, 1, 're-render does not replay effects');
  fresh(); const m = S.createSound({ storage: mem(), Audio: FakeAudio }); m.setEnabled(false); const fb2 = S.createFeedback(m), s2 = K.createSession('hvh'); fb2.observe(view(s2)); choose(s2, C(3, 'CUT', '2-3'), C(8, 'CREATE', '3-8')); fb2.observe(view(s2)); eq(FakeAudio.made, 0); eq(FakeAudio.played.length, 0);
});
return results;
});
