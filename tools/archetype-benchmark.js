'use strict';
// Complete-game, side-swapped benchmark of all 20 catalog profiles against four fixed baselines.
// This is diagnostic benchmarking, not a certified Elo or optimality proof.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
['constants', 'graph', 'rules', 'state', 'ai'].forEach(f => require(path.join(root, 'src', f + '.js')));
const N = globalThis.NORI;
const profiles = require(path.join(root, 'src', 'bots-data.json'));
const { createOpponentSet } = require('./archetype-opponents.js');
const opponents = createOpponentSet(N);
N.bots = { get: id => profiles.find(b => b.id === id) || null };
const arg = name => { const p = process.argv.find(x => x.startsWith('--' + name + '=')); return p ? p.slice(name.length + 3) : null; };
const profileStart = Math.max(0, Math.min(profiles.length - 1, Number(arg('profile-start') || 0)));
const profileLimit = Math.max(1, Math.min(profiles.length - profileStart, Number(arg('profile-limit') || (profiles.length - profileStart))));
const repetitions = Math.max(1, Math.min(10, Number(arg('repetitions') || 1)));
const roundCap = Math.max(1, Math.min(200, Number(arg('round-cap') || 18)));
const seedBase = Number(arg('seed') || 20261022) >>> 0;
const outDir = path.join(root, 'reports');
fs.mkdirSync(outDir, { recursive: true });
const runLabel = `v${N.C.APP_VERSION}-seed${seedBase}-s${profileStart}-p${profileLimit}-r${repetitions}`;
const jsonPath = path.join(outDir, `ai-archetype-benchmark-${runLabel}.json`);
const mdPath = path.join(outDir, `ai-archetype-benchmark-${runLabel}.md`);
const partialPath = path.join(outDir, `ai-archetype-benchmark-${runLabel}.partial.json`);
const archetypes = opponents.names;
const chosenProfiles = profiles.slice(profileStart, profileStart + profileLimit);
const games = [];
const started = Date.now();
function play(profile, archetype, profileSide, repetition) {
  let state = N.state.createInitialState();
  const seed = (seedBase ^ Math.imul(profile.number || 1, 0x45d9f3b) ^ Math.imul(archetypes.indexOf(archetype) + 1, 0x27d4eb2d) ^ Math.imul(repetition + 1, 0x165667b1) ^ Math.imul(profileSide + 1, 0x85ebca6b)) >>> 0;
  while (!state.result && state.rounds.length < roundCap) {
    const choices = [0, 1].map(player => player === profileSide
      ? N.ai.chooseAIAction(state, player, profile.id)
      : opponents.choose(archetype, state, player, { seed }));
    choices.forEach(N.rules.validateChoice);
    state = N.state.playRound(state, choices);
  }
  const capped = !state.result;
  const result = state.result || { type: 'capped', winner: null, code: 'ROUND_CAP', reason: 'round_cap' };
  const record = { profileId: profile.id, profile: profile.slug, profileName: profile.name, profileTier: profile.tier,
    archetype, profileSide, profileSideName: profileSide === 0 ? 'white' : 'black', repetition, seed,
    rounds: state.rounds.length, type: result.type, winner: result.winner,
    profileOutcome: capped ? 'capped' : result.type === 'draw' ? 'draw' : result.winner === profileSide ? 'win' : 'loss',
    code: result.code, reason: result.reason, capped };
  games.push(record);
  if (games.length % 5 === 0) fs.writeFileSync(partialPath, JSON.stringify({ status: 'in_progress', appVersion: N.C.APP_VERSION, rulesVersion: N.C.VERSION, seedBase, profiles: chosenProfiles.length, repetitions, roundCap, completedGames: games.length, targetGames: totalToRun, gameRecords: games }, null, 2) + '\n');
  return record;
}
const totalToRun = chosenProfiles.length * archetypes.length * 2 * repetitions;
let completed = 0;
for (const profile of chosenProfiles) {
  for (const archetype of archetypes) {
    for (let rep = 0; rep < repetitions; rep++) {
      play(profile, archetype, 0, rep);
      play(profile, archetype, 1, rep);
      completed += 2;
    }
  }
  if (completed % 10 === 0 || completed === totalToRun) {
    console.log(`Progress: ${completed}/${totalToRun} games (${profile.name})`);
  }
}
const emptyStats = () => ({ games: 0, wins: 0, draws: 0, losses: 0, capped: 0, points: 0, rounds: 0, scorePct: 0, winPct: 0 });
const profileStats = Object.fromEntries(chosenProfiles.map(p => [p.slug, { id: p.id, name: p.name, displayedRating: p.rating, tierLabel: p.tier, ...emptyStats(), byArchetype: Object.fromEntries(archetypes.map(a => [a, emptyStats()])) }]));
const archetypeStats = Object.fromEntries(archetypes.map(a => [a, emptyStats()]));
function applyStat(stat, game) {
  stat.games++; stat.rounds += game.rounds;
  if (game.profileOutcome === 'win') { stat.wins++; stat.points += 1; }
  else if (game.profileOutcome === 'draw') { stat.draws++; stat.points += 0.5; }
  else if (game.profileOutcome === 'loss') stat.losses++;
  else stat.capped++;
}
for (const game of games) {
  applyStat(profileStats[game.profile].byArchetype[game.archetype], game);
  applyStat(profileStats[game.profile], game);
  applyStat(archetypeStats[game.archetype], game);
}
for (const stat of [...Object.values(profileStats), ...Object.values(archetypeStats), ...Object.values(profileStats).flatMap(x => Object.values(x.byArchetype))]) {
  const ratedGames = stat.wins + stat.draws + stat.losses;
  stat.scorePct = ratedGames ? Math.round(10000 * stat.points / ratedGames) / 100 : 0;
  stat.winPct = ratedGames ? Math.round(10000 * stat.wins / ratedGames) / 100 : 0;
  stat.avgRounds = stat.games ? Math.round(100 * stat.rounds / stat.games) / 100 : 0;
  delete stat.rounds;
}
const ranking = Object.values(profileStats).sort((a, b) => b.scorePct - a.scorePct || b.winPct - a.winPct || a.avgRounds - b.avgRounds).map((p, i) => ({ rank: i + 1, profile: p.name, slug: p.id, games: p.games, scorePct: p.scorePct, winPct: p.winPct, draws: p.draws, losses: p.losses, capped: p.capped }));
const overall = { appVersion: N.C.APP_VERSION, rulesVersion: N.C.VERSION, seedBase, profileStart, profiles: chosenProfiles.length, repetitions, roundCap, archetypes: opponents.names.map(name => ({ name, description: opponents.descriptions[name], ...archetypeStats[name] })), games: games.length, completed: games.filter(g => !g.capped).length, capped: games.filter(g => g.capped).length,
  wins: games.filter(g => g.profileOutcome === 'win').length, draws: games.filter(g => g.profileOutcome === 'draw').length, losses: games.filter(g => g.profileOutcome === 'loss').length,
  avgRounds: Math.round(100 * games.reduce((s, g) => s + g.rounds, 0) / games.length) / 100,
  endReasons: games.reduce((acc, g) => { acc[g.code] = (acc[g.code] || 0) + 1; return acc; }, {}), elapsedMs: Date.now() - started, ranking, profileStats, gameRecords: games };
fs.writeFileSync(jsonPath, JSON.stringify(overall, null, 2) + '\n');
const lines = [
  `# NORI V${N.C.APP_VERSION} — полный бенчмарк стратегической силы ИИ`, '',
  `- Версия правил: **${N.C.VERSION}** (не изменена).`, `- Seed: **${seedBase}**; профили: **${chosenProfiles.length}**; партий: **${games.length}**.`,
  `- Исходы профиля: **${overall.wins} побед**, **${overall.draws} ничьих**, **${overall.losses} поражений**, **${overall.capped} незавершённых по лимиту**.`,
  `- Средняя длина: **${overall.avgRounds} раунда**; время: **${(overall.elapsedMs / 1000).toFixed(2)} с**.`, '',
  '## Референтные соперники', '',
  '| Соперник | Победы профилей | Ничьи | Поражения профилей | Средний балл | Среднее число раундов |', '|---|---:|---:|---:|---:|---:|',
  ...archetypes.map(a => { const s = archetypeStats[a]; return `| ${a} — ${opponents.descriptions[a]} | ${s.wins} | ${s.draws} | ${s.losses} | ${s.scorePct}% | ${s.avgRounds} |`; }), '',
  '## Предварительный рейтинг профилей по этому набору', '',
  '| # | Профиль | Партий | Баллы % | Победы % | Ничьи | Поражения | Лимит |', '|---:|---|---:|---:|---:|---:|---:|---:|',
  ...ranking.map(p => `| ${p.rank} | ${p.profile} | ${p.games} | ${p.scorePct}% | ${p.winPct}% | ${p.draws} | ${p.losses} | ${p.capped} |`), '',
  '## Ограничения интерпретации', '',
  '- «Случайный» соперник выбирает равномерно из 56 абстрактных решений; случайность воспроизводима по seed.',
  '- «Агрессивный» и «защитный» — простые жадные одношаговые базовые соперники, а не модели реальных людей.',
  '- «Тактический» — базовый maximin-движок без профиля. Профили NORI — вариации общей эвристики, а не 20 независимых моделей.',
  '- Проценты баллов и ранжирование описывают только этот фиксированный набор, не являются Elo и не доказывают оптимальную стратегию или баланс сторон.',
  '- Перед окончательной калибровкой рейтингов следует повторить турнир на нескольких seed и увеличить количество партий на профиль; реальные игровые сессии тестировать отдельно.', '',
  `Полные записи каждой партии: [1m${path.basename(jsonPath)}[0m`, ''
];
fs.writeFileSync(mdPath, lines.join('\n'));
try { fs.unlinkSync(partialPath); } catch (_) {}
console.log('\nSUMMARY');
console.log(JSON.stringify({ games: overall.games, completed: overall.completed, capped: overall.capped, wins: overall.wins, draws: overall.draws, losses: overall.losses, avgRounds: overall.avgRounds, elapsedSeconds: Number((overall.elapsedMs / 1000).toFixed(2)), archetypes: overall.archetypes.map(a => ({ name: a.name, wins: a.wins, draws: a.draws, losses: a.losses, scorePct: a.scorePct })), ranking: ranking.slice(0, 20), jsonPath, mdPath }, null, 2));
