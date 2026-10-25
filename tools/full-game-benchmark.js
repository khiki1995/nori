'use strict';
// Reproducible full-game benchmark for NORI v0.2.6. Rules remain unchanged.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
['constants', 'graph', 'rules', 'state', 'ai'].forEach(f => require(path.join(root, 'src', f + '.js')));
const N = globalThis.NORI;
const profiles = require(path.join(root, 'src', 'bots-data.json'));
N.bots = { get: id => profiles.find(b => b.id === id) || null };
const arg = name => { const p = process.argv.find(x => x.startsWith('--' + name + '=')); return p ? p.slice(name.length + 3) : null; };
const pairLimit = Math.max(1, Math.min(profiles.length / 2, Number(arg('pair-limit') || profiles.length / 2)));
const roundCap = Math.max(1, Math.min(200, Number(arg('round-cap') || 60)));
const pairs = Array.from({ length: pairLimit }, (_, i) => [profiles[i], profiles[profiles.length - 1 - i]]);
const games = [];
const started = Date.now();
function play(a, b, pairIndex, swap) {
  let state = N.state.createInitialState();
  while (!state.result && state.rounds.length < roundCap) {
    const choices = [N.ai.chooseAIAction(state, 0, a.id), N.ai.chooseAIAction(state, 1, b.id)];
    choices.forEach(N.rules.validateChoice);
    state = N.state.playRound(state, choices);
  }
  const capped = !state.result;
  const result = state.result || { type: 'capped', winner: null, code: 'ROUND_CAP', reason: 'round_cap' };
  const record = { pairIndex, pair: a.slug + '-vs-' + b.slug, swap, white: a.slug, black: b.slug, rounds: state.rounds.length, type: result.type, winner: result.winner, code: result.code, reason: result.reason, capped };
  games.push(record);
  console.log(JSON.stringify(record));
  return record;
}
for (let i = 0; i < pairs.length; i++) {
  const [a, b] = pairs[i];
  play(a, b, i, false);
  play(b, a, i, true);
}
const profileStats = Object.fromEntries(profiles.map(p => [p.slug, { label: p.name, ratingLabel: p.rating, games: 0, wins: 0, draws: 0, losses: 0, points: 0, rounds: 0 }]));
for (const g of games) {
  for (const slug of [g.white, g.black]) { profileStats[slug].games++; profileStats[slug].rounds += g.rounds; }
  if (g.type === 'draw') {
    profileStats[g.white].draws++; profileStats[g.black].draws++;
    profileStats[g.white].points += 0.5; profileStats[g.black].points += 0.5;
  } else if (g.type === 'win') {
    const win = g.winner === 0 ? g.white : g.black, loss = g.winner === 0 ? g.black : g.white;
    profileStats[win].wins++; profileStats[win].points++;
    profileStats[loss].losses++;
  }
}
const total = { version: N.C.APP_VERSION, rulesVersion: N.C.VERSION, pairLimit, roundCap, games: games.length, completed: games.filter(g => !g.capped).length, capped: games.filter(g => g.capped).length, avgRounds: games.reduce((s, g) => s + g.rounds, 0) / (games.length || 1), drawReasons: {}, wins: 0, draws: 0, elapsedMs: Date.now() - started, profiles: profileStats, gameRecords: games };
for (const g of games) { if (g.type === 'draw') { total.draws++; total.drawReasons[g.code] = (total.drawReasons[g.code] || 0) + 1; } if (g.type === 'win') total.wins++; }
console.log('\nSUMMARY_JSON ' + JSON.stringify(total, null, 2));
