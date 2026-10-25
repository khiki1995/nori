// Finished local-game archive and replay UI. This screen never alters the current live session.
(function () {
'use strict';
const N = NORI, I = I18N, U = N.ui, el = U.el, t = (key, params) => I.t(key, params);
let storage = null; try { storage = window.localStorage; } catch (_) { storage = null; }
let selectedId = null, replay = null, replaySession = null, autoTimer = null;
const root = () => document.getElementById('screenGames');
const stopAuto = () => { if (autoTimer !== null) { window.clearInterval(autoTimer); autoTimer = null; } };
const modeText = mode => t(mode === 'ai' ? 'gamesModeAi' : 'gamesModeHvh');
function resultText(result) {
  if (!result || result.type === 'draw') return t('gamesDraw');
  return t('gamesWinner', { p: U.pname(result.winner) });
}
function openReplay(id) {
  stopAuto(); const loaded = N.games.load(storage, id);
  if (!loaded.ok) { selectedId = null; replay = null; replaySession = null; notice = loaded.code; render(); return; }
  selectedId = id; replaySession = loaded.session; replay = N.replay.createReplay(loaded.session.state); render();
}
let notice = '';
function renderArchive() {
  const r = root();
  r.append(el('div', { class: 'screen-head' }, [el('div', {}, [el('h2', {}, t('gamesTitle')), el('p', { class: 'screen-intro' }, t('gamesIntro'))]),
    el('button', { class: 'ghost', disabled: N.games.list(storage).length === 0, onclick: () => { if (window.confirm(t('gamesConfirmClear'))) { N.games.clear(storage); notice = ''; render(); } } }, t('gamesClear'))]));
  if (notice) { r.append(el('p', { class: 'lab-notice', role: 'status' }, notice)); notice = ''; }
  const entries = N.games.list(storage);
  if (!entries.length) { r.append(el('section', { class: 'empty-state' }, [el('div', { class: 'empty-icon', 'aria-hidden': 'true' }, '↺'), el('h3', {}, t('gamesEmpty'))])); return; }
  const grid = el('div', { class: 'archive-grid' });
  entries.forEach(entry => {
    let date = entry.date;
    try { date = new Date(entry.date).toLocaleString(I.current()); } catch (_) { /* keep ISO timestamp */ }
    grid.append(el('article', { class: 'archive-card' }, [
      el('div', { class: 'archive-card-top' }, [el('span', { class: 'archive-mode' }, modeText(entry.mode)), el('span', { class: 'archive-date' }, date)]),
      el('h3', {}, resultText(entry.result)),
      el('p', { class: 'archive-meta' }, t('gamesRounds', { n: entry.rounds })),
      el('div', { class: 'actions' }, [
        el('button', { class: 'primary', onclick: () => openReplay(entry.id) }, t('gamesOpen')),
        el('button', { class: 'ghost', onclick: () => { if (window.confirm(t('gamesDelete') + '?')) { N.games.remove(storage, entry.id); render(); } } }, t('gamesDelete'))
      ])
    ]));
  });
  r.append(grid);
}
function eventText(event) {
  if (event.kind === 'apply') return t('repEventApply', { p: U.pname(event.player), a: U.aname(event.action), e: U.fe(event.edge), r: t(event.changed ? (event.action === 'CREATE' ? 'repCreate' : 'repCut') : 'repNoChange') });
  if (event.kind === 'merged') return t('repEventMerged', { a: U.aname(event.action), e: U.fe(event.edge), r: t(event.changed ? (event.action === 'CREATE' ? 'repCreate' : 'repCut') : 'repNoChange') });
  if (event.kind === 'override') return t('repEventOverride', { e: U.fe(event.edge), p: U.pname(event.winner) });
  return t('repEventConflict', { e: U.fe(event.edge) });
}
function makeView(snapshot) {
  const rounds = replaySession.state.rounds.slice(0, snapshot.index);
  return { mode: replaySession.mode, phase: snapshot.index === 0 ? 'pick' : snapshot.result ? 'over' : 'reveal', turn: 0,
    round: snapshot.index === 0 ? 1 : snapshot.round + 1, edges: snapshot.edges.slice(), streak: snapshot.streak.slice(),
    beacons: snapshot.beacons.map(x => x.slice()), rounds, result: snapshot.result, hasPending: [false, false], canUndo: false,
    lastRound: snapshot.record, online: { status: 'offline', opponentPresent: false, opponentConnected: false } };
}
function renderReplay() {
  const r = root(), snap = replay.current(), verified = N.replay.verify(replaySession.state).ok;
  r.append(el('div', { class: 'screen-head' }, [el('div', {}, [el('h2', {}, t('gamesReplayTitle')),
      el('p', { class: 'screen-intro' }, snap.index === 0 ? t('repInitial') : t('repAfterRound', { n: snap.round }))]),
    el('span', { class: 'status-pill ' + (verified ? 'good' : 'bad'), role: 'status' }, t(verified ? 'repVerified' : 'repUnverified'))]));
  r.append(el('button', { class: 'ghost replay-back', onclick: () => { stopAuto(); selectedId = null; replay = null; replaySession = null; render(); } }, '← ' + t('repBack')));
  const svg = el('svg', { id: 'replayBoard', class: 'archive-board', viewBox: '0 0 520 520', role: 'img', 'aria-label': t('board') }, [], true);
  const board = el('div', { class: 'boardwrap replay-boardwrap' }, [svg]);
  const left = el('section', { class: 'replay-board-panel' }, [board,
    el('div', { class: 'replay-controls' }, [
      el('button', { class: 'ghost', disabled: replay.atStart, onclick: () => { replay.first(); render(); } }, '⏮ ' + t('repFirst')),
      el('button', { class: 'ghost', disabled: replay.atStart, onclick: () => { replay.prev(); render(); } }, '◀ ' + t('repPrev')),
      el('button', { class: 'primary', onclick: () => { if (autoTimer !== null) { stopAuto(); render(); } else { if (replay.atEnd) replay.first(); autoTimer = window.setInterval(() => { if (replay.atEnd) stopAuto(); else replay.next(); render(); }, 1000); render(); } } }, (autoTimer !== null ? 'Ⅱ ' + t('repStop') : '▶ ' + t('repAuto'))),
      el('button', { class: 'ghost', disabled: replay.atEnd, onclick: () => { replay.next(); render(); } }, t('repNext') + ' ▶'),
      el('button', { class: 'ghost', disabled: replay.atEnd, onclick: () => { replay.last(); render(); } }, t('repLast') + ' ⏭')
    ])]);
  U.renderBoard(makeView(snap), { svg, picking: false, pick: { node: null, action: null, edge: null } });
  const right = el('section', { class: 'replay-details' });
  right.append(el('h3', {}, t('repActions')));
  if (!snap.record) right.append(el('p', { class: 'empty-inline' }, t('repNoActions')));
  else {
    snap.record.choices.forEach((choice, player) => right.append(el('p', { class: 'replay-choice' }, U.choiceText(player, choice, snap.record.commitments[player]))));
    right.append(el('div', { class: 'replay-events' }, snap.record.events.map(e => el('p', { class: 'replay-event' + (e.kind === 'conflict' ? ' conflict' : '') }, eventText(e)))));
    right.append(el('h3', {}, t('repChanges')));
    right.append(snap.record.changes.length ? el('div', { class: 'edge-changes' }, snap.record.changes.map(change => el('span', { class: 'tag ' + (change.after ? 'create' : 'cut') }, `${change.after ? '＋' : '✕'} ${U.fe(change.edge)}`))) : el('p', { class: 'empty-inline' }, t('repNoChanges')));
  }
  if (snap.result) right.append(el('p', { class: 'status-pill good' }, resultText(snap.result)));
  r.append(el('div', { class: 'replay-layout' }, [left, right]));
}
function render() {
  stopAutoIfTerminal();
  const r = root(); if (!r) return; r.replaceChildren();
  if (selectedId && replay && replaySession) renderReplay(); else { selectedId = null; replay = null; replaySession = null; renderArchive(); }
}
function stopAutoIfTerminal() { if (autoTimer !== null && replay && replay.atEnd) stopAuto(); }
N.ui.screens.games = { show() { stopAuto(); }, render };
})();
