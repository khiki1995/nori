// NORI sound design V0.1.1.
// Original locally bundled WAV cues; no third-party audio, remote requests, or streaming services.
// Events are driven by real state transitions so rerendering never repeats a cue.
(function (G) {
'use strict';
const N = G.NORI = G.NORI || {}, KEY = 'nori.sound.v1';
const SOUNDS = {
  click: 'nori-click-soft.wav', create: 'nori-create.wav', cut: 'nori-cut.wav', confirm: 'nori-confirm.wav',
  edgeCreated: 'nori-edgeCreated.wav', edgeRemoved: 'nori-edgeRemoved.wav', conflict: 'nori-conflict.wav',
  beacon: 'nori-beacon.wav', win: 'nori-win.wav', lose: 'nori-lose.wav', draw: 'nori-draw.wav',
  netError: 'nori-netError.wav', reveal: 'nori-reveal.wav', error: 'nori-error.wav', join: 'nori-join.wav',
  leave: 'nori-leave.wav', rejoin: 'nori-rejoin.wav'
};
const clamp = v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));
function loadCfg(st) {
  try { const d = JSON.parse(st && st.getItem(KEY) || '{}'); return { enabled: d.enabled !== false, volume: d.volume === undefined ? 0.58 : clamp(Number(d.volume)) }; }
  catch (_) { return { enabled: true, volume: 0.58 }; }
}
function createSound(deps) {
  deps = deps || {};
  const st = deps.storage, AudioCtor = deps.Audio || (typeof Audio !== 'undefined' ? Audio : null);
  const assetBase = typeof deps.assetBase === 'string' ? deps.assetBase : 'assets/sounds/';
  const isHidden = deps.isHidden || (() => typeof document !== 'undefined' && !!document.hidden);
  let cfg = st ? loadCfg(st) : { enabled: true, volume: 0.58 };
  const log = [], active = new Set();
  const persist = () => { try { if (st) st.setItem(KEY, JSON.stringify(cfg)); } catch (_) { /* preferences remain active for this session */ } };
  function playNow(name) {
    if (!cfg.enabled || cfg.volume <= 0 || isHidden() || !AudioCtor || !SOUNDS[name]) return false;
    let audio;
    try {
      audio = new AudioCtor(assetBase + SOUNDS[name]);
      audio.preload = 'auto';
      audio.volume = clamp(cfg.volume * 0.68);
      audio.setAttribute && audio.setAttribute('aria-hidden', 'true');
      active.add(audio);
      const release = () => active.delete(audio);
      audio.addEventListener && audio.addEventListener('ended', release, { once: true });
      audio.addEventListener && audio.addEventListener('error', release, { once: true });
      const promise = audio.play();
      if (promise && typeof promise.catch === 'function') promise.catch(release);
      log.push({ name, at: Date.now(), src: SOUNDS[name] }); if (log.length > 100) log.shift();
      return true;
    } catch (_) { if (audio) active.delete(audio); return false; }
  }
  return {
    get: () => ({ enabled: cfg.enabled, volume: cfg.volume }),
    setEnabled(b) { cfg.enabled = !!b; if (!cfg.enabled) { active.forEach(a => { try { a.pause(); a.currentTime = 0; } catch (_) {} }); active.clear(); } persist(); },
    setVolume(v) { cfg.volume = clamp(Number(v)); active.forEach(a => { try { a.volume = clamp(cfg.volume * 0.68); } catch (_) {} }); persist(); },
    history: () => log.slice(),
    // Called by a user gesture; HTML audio itself is created only when a sound is requested.
    unlock() { /* Browsers permit playback after an explicit user gesture; failed playback is safely ignored. */ },
    play(name, delay) {
      if (!cfg.enabled || cfg.volume <= 0 || !SOUNDS[name] || !AudioCtor) return false;
      const ms = Math.max(0, Math.min(1.2, Number(delay) || 0) * 1000);
      if (ms > 0) { setTimeout(() => playNow(name), ms); return true; }
      return playNow(name);
    }
  };
}

// Maps view transitions to sounds. First view and changes of game/room establish a silent baseline.
function createFeedback(sound) {
  let base = null;
  return {
    reset() { base = null; },
    observe(v) {
      const online = v.online || null, key = v.mode + ':' + (online && online.code || '');
      const cur = { key, present: !!(online && online.opponentPresent), oconn: !!(online && online.opponentConnected), rounds: v.rounds.length, beacons: v.beacons.map(b => b.slice()), locked: !!(online && online.youLocked), conn: online ? online.status : null };
      if (!base || base.key !== cur.key || cur.rounds < base.rounds) { base = cur; return []; }
      const played = [], P = (n, d) => { sound.play(n, d); played.push(n); }; let d = 0;
      if (cur.rounds > base.rounds) {
        const rec = v.rounds[v.rounds.length - 1], ch = rec.changes || []; P('reveal', 0); d = 0.18;
        if (ch.some(c => c.after)) { P('edgeCreated', d); d += 0.22; }
        if (ch.some(c => !c.after)) { P('edgeRemoved', d); d += 0.22; }
        if (rec.events.some(e => e.kind === 'conflict')) { P('conflict', d); d += 0.28; }
        if (cur.beacons.some((b, i) => b.some((x, j) => x !== base.beacons[i][j]))) { P('beacon', d); d += 0.28; }
        if (v.result) { const r = v.result, me = v.mode === 'online' ? v.turn : 0; P(r.type === 'draw' ? 'draw' : v.mode === 'hvh' ? 'win' : r.winner === me ? 'win' : 'lose', d + 0.12); }
      }
      if (online && cur.conn === 'connected' && base.conn === 'connected') {
        if (!base.present && cur.present) P('join'); else if (base.present && cur.present) { if (base.oconn && !cur.oconn) P('leave'); else if (!base.oconn && cur.oconn) P('rejoin'); }
      }
      if (cur.locked && !base.locked) P('confirm');
      if (cur.conn !== base.conn && base.conn === 'connected' && (cur.conn === 'reconnecting' || cur.conn === 'failed')) P('netError');
      base = cur; return played;
    }
  };
}
N.sound = { KEY, SOUNDS, createSound, createFeedback };
})(typeof window !== 'undefined' ? window : globalThis);
