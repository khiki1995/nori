// NORI LAB user interface. Every action is hypothetical and isolated from official sessions.
(function () {
'use strict';
const N = NORI, I = I18N, U = N.ui, el = U.el, t = (key, params) => I.t(key, params), C = N.C;
let lab = N.lab.createLab(), selectedNode = 1, notice = '', scenarioText = '', preview = null;
let picks = [
  { node: 1, action: 'CREATE', edge: '1-2' },
  { node: 6, action: 'CUT', edge: '5-6' }
];
const root = () => document.getElementById('screenLab');
const has = edge => lab.edges.includes(edge);
function choiceSelect(player, field, options, label) {
  const current = picks[player][field];
  const select = el('select', { 'aria-label': label });
  options.forEach(option => select.append(el('option', { value: String(option.value), selected: String(option.value) === String(current) }, option.label)));
  select.onchange = () => { picks[player][field] = field === 'node' ? Number(select.value) : select.value; preview = null; render(); };
  return select;
}
function choiceCard(player) {
  const name = t(player === 0 ? 'labWhite' : 'labBlack'), choice = picks[player];
  const commitment = C.EDGES.includes(choice.edge) && N.graph.edgeEnds(choice.edge).includes(choice.node);
  const nodes = C.NODES.map(n => ({ value: n, label: String(n) }));
  const actions = [{ value: 'CREATE', label: '＋ ' + t('create') }, { value: 'CUT', label: '✕ ' + t('cut') }];
  const edges = C.EDGES.map(edge => ({ value: edge, label: `${edge.replace('-', '–')} · ${has(edge) ? '●' : '○'}` }));
  return el('section', { class: 'lab-choice-card' }, [
    el('h3', {}, name),
    el('label', { class: 'field' }, [el('span', {}, t('labNode')), choiceSelect(player, 'node', nodes, t('labNode'))]),
    el('label', { class: 'field' }, [el('span', {}, t('labAction')), choiceSelect(player, 'action', actions, t('labAction'))]),
    el('label', { class: 'field' }, [el('span', {}, t('labEdge')), choiceSelect(player, 'edge', edges, t('labEdge'))]),
    el('p', { class: 'status-pill ' + (commitment ? 'good' : 'neutral') }, t(commitment ? 'labCommitYes' : 'labCommitNo'))
  ]);
}
function makeView() {
  const position = N.lab.getPosition(lab);
  let lastRound = null;
  if (preview) lastRound = { round: lab.steps + 1, choices: picks.map(x => Object.assign({}, x)), commitments: picks.map(x => N.rules.getCommitment(x).committed), events: preview.events, changes: preview.changes };
  return { mode: 'hvh', phase: 'pick', turn: 0, round: lab.steps + 1, edges: position.edges, streak: position.streak, beacons: position.beacons,
    rounds: [], lastRound, result: position.result, hasPending: [false, false], canUndo: false };
}
function renderNetworkStatus() {
  const maps = N.lab.networkMap(lab.edges);
  return el('section', { class: 'lab-map' }, [el('h3', {}, t('labMapTitle')),
    ...maps.map(map => el('div', { class: 'lab-map-player' }, [
      el('h4', {}, t(map.player === 0 ? 'white' : 'black')),
      ...map.beacons.map(beacon => el('p', {}, `${t('beacon')} ${beacon.node}: ${t(beacon.connected ? 'labConnected' : 'labDisconnected')}`)),
      el('p', { class: 'lab-vital' }, `${t('labVital')}: ${map.vital.length ? map.vital.map(x => x.replace('-', '–')).join(', ') : t('labNone')}`)
    ]))
  ]);
}
function previewPanel() {
  const p = el('section', { class: 'lab-preview' }, [el('h3', {}, t('labPreviewTitle'))]);
  if (!preview) { p.append(el('p', { class: 'empty-inline' }, t('labNeedPreview'))); return p; }
  if (preview.changes.length) p.append(el('div', { class: 'edge-changes' }, preview.changes.map(change => el('span', { class: 'tag ' + (change.after ? 'create' : 'cut') }, `${change.after ? '＋' : '✕'} ${change.edge.replace('-', '–')}`))));
  else p.append(el('p', { class: 'empty-inline' }, t('labNoChanges')));
  preview.events.forEach(event => p.append(el('p', { class: 'replay-event' + (event.kind === 'conflict' ? ' conflict' : '') }, event.kind === 'conflict' ? t('repEventConflict', { e: event.edge.replace('-', '–') }) : event.kind === 'override' ? t('repEventOverride', { e: event.edge.replace('-', '–'), p: U.pname(event.winner) }) : event.kind === 'merged' ? t('repEventMerged', { a: U.aname(event.action), e: event.edge.replace('-', '–'), r: t(event.changed ? (event.action === 'CREATE' ? 'repCreate' : 'repCut') : 'repNoChange') }) : t('repEventApply', { p: U.pname(event.player), a: U.aname(event.action), e: event.edge.replace('-', '–'), r: t(event.changed ? (event.action === 'CREATE' ? 'repCreate' : 'repCut') : 'repNoChange') }))));
  p.append(el('p', { class: 'lab-no-history' }, t('labNoHistory')));
  if (preview.result) p.append(el('p', { class: 'status-pill good' }, t('labResult', { r: preview.result.type === 'draw' ? t('draw') : t('gamesWinner', { p: U.pname(preview.result.winner) }) })));
  return p;
}
function downloadScenario() {
  try { scenarioText = N.lab.exportScenario(lab, { name: lab.name || 'NORI Lab scenario' }); }
  catch (error) { notice = error.code === 'LAB_TERMINAL' ? t('labTerminal') : (error.code || 'LAB_ERROR'); render(); return; }
  try {
    const blob = new Blob([scenarioText], { type: 'application/json' }), href = URL.createObjectURL(blob), a = el('a', { href, download: 'nori-scenario.json' });
    document.body.append(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch (_) { /* textarea remains available for manual copy */ }
  notice = t('labExported'); render();
}
function importScenario() {
  const result = N.lab.importScenario(scenarioText);
  if (!result.ok) { notice = t('labImportBad'); render(); return; }
  lab = result.lab; selectedNode = 1; preview = null; picks = [{ node: 1, action: 'CREATE', edge: '1-2' }, { node: 6, action: 'CUT', edge: '5-6' }]; notice = t('labImportOk'); render();
}
function render() {
  const r = root(); if (!r) return; r.replaceChildren();
  r.append(el('div', { class: 'screen-head' }, [el('div', {}, [el('h2', {}, t('labTitle')), el('p', { class: 'screen-intro' }, t('labIntro'))])]));
  r.append(el('p', { class: 'status-pill neutral' }, t('labArtificial')));
  if (notice) { r.append(el('p', { class: 'lab-notice', role: 'status' }, notice)); notice = ''; }
  const svg = el('svg', { id: 'labBoard', class: 'archive-board', viewBox: '0 0 520 520', role: 'img', 'aria-label': t('board') }, [], true);
  const board = el('section', { class: 'lab-board-panel' }, [el('div', { class: 'boardwrap' }, [svg]), el('p', { class: 'screen-intro' }, t('labClickHint')), el('p', { class: 'status-pill neutral' }, t('labSelectedNode', { n: selectedNode }))]);
  U.renderBoard(makeView(), { svg, picking: true, pick: { node: selectedNode, action: null, edge: null }, onNode: node => { selectedNode = node; render(); }, onEdge: edge => { N.lab.toggleEdge(lab, edge); preview = null; render(); } });
  const controls = el('section', { class: 'lab-controls' }, [choiceCard(0), choiceCard(1),
    el('div', { class: 'actions lab-actions' }, [
      el('button', { class: 'primary', onclick: () => { try { preview = N.lab.tryActions(lab, picks.map(x => Object.assign({}, x))); render(); } catch (error) { notice = error.code || 'LAB_ERROR'; render(); } } }, t('labPreview')),
      el('button', { onclick: () => { try { preview = N.lab.applyActions(lab, picks.map(x => Object.assign({}, x))); render(); } catch (error) { notice = error.code || 'LAB_ERROR'; render(); } } }, t('labApply')),
      el('button', { class: 'ghost', onclick: () => { N.lab.reset(lab); preview = null; notice = ''; render(); } }, t('labReset'))
    ]), previewPanel(), renderNetworkStatus(),
    el('section', { class: 'scenario-panel' }, [el('h3', {}, t('labExport')),
      el('p', { class: 'screen-intro' }, t('labScenarioHint')),
      el('textarea', { class: 'scenario-text', spellcheck: 'false', 'aria-label': t('labScenarioHint'), oninput: e => { scenarioText = e.target.value; } }, scenarioText),
      el('div', { class: 'actions' }, [el('button', { onclick: downloadScenario }, t('labExport')), el('button', { class: 'ghost', onclick: importScenario }, t('labImport'))])
    ])
  ]);
  r.append(el('div', { class: 'lab-layout' }, [board, controls]));
}
N.ui.screens.lab = { show() {}, render };
})();
