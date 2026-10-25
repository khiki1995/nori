'use strict';
// Merge deterministic benchmark batches made with the same seed, round cap and repetition count.
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const inputs = process.argv.slice(2).map(p => path.resolve(process.cwd(), p));
if (!inputs.length) { console.error('Usage: node tools/merge-archetype-reports.js <batch-1.json> <batch-2.json> ...'); process.exit(2); }
const docs = inputs.map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
const first = docs[0];
for (const d of docs) for (const k of ['appVersion','rulesVersion','repetitions','roundCap']) if (d[k] !== first[k]) throw new Error(`Incompatible report metadata: ${k}`);
const seedBases = [...new Set(docs.map(d => d.seedBase))].sort((a,b)=>a-b);
const games = docs.flatMap(d => d.gameRecords);
const profiles = require(path.join(root,'src','bots-data.json'));
const { createOpponentSet } = require('./archetype-opponents.js');
const N = { C: { APP_VERSION: first.appVersion, VERSION:first.rulesVersion } };
const opps = createOpponentSet({}); // Names/descriptions are static; chooser is not called here.
const archetypes = ['random','aggressive','defensive','tactical'];
const stats = () => ({ games:0,wins:0,draws:0,losses:0,capped:0,points:0,rounds:0,scorePct:0,winPct:0,avgRounds:0 });
const profileStats = Object.fromEntries(profiles.map(p => [p.slug,{id:p.id,name:p.name,displayedRating:p.rating,tierLabel:p.tier,...stats(),byArchetype:Object.fromEntries(archetypes.map(a=>[a,stats()]))}]));
const archetypeStats = Object.fromEntries(archetypes.map(a=>[a,stats()]));
function apply(s,g){s.games++;s.rounds+=g.rounds;if(g.profileOutcome==='win'){s.wins++;s.points++;}else if(g.profileOutcome==='draw'){s.draws++;s.points+=.5;}else if(g.profileOutcome==='loss')s.losses++;else s.capped++;}
for(const g of games){apply(profileStats[g.profile].byArchetype[g.archetype],g);apply(profileStats[g.profile],g);apply(archetypeStats[g.archetype],g);}
for(const s of [...Object.values(profileStats),...Object.values(archetypeStats),...Object.values(profileStats).flatMap(p=>Object.values(p.byArchetype))]){const rated=s.wins+s.draws+s.losses;s.scorePct=rated?Math.round(10000*s.points/rated)/100:0;s.winPct=rated?Math.round(10000*s.wins/rated)/100:0;s.avgRounds=s.games?Math.round(100*s.rounds/s.games)/100:0;delete s.rounds;}
const ranking=Object.values(profileStats).filter(p=>p.games).sort((a,b)=>b.scorePct-a.scorePct||b.winPct-a.winPct||a.avgRounds-b.avgRounds).map((p,i)=>({rank:i+1,profile:p.name,slug:p.id,games:p.games,scorePct:p.scorePct,winPct:p.winPct,draws:p.draws,losses:p.losses,capped:p.capped}));
const report={appVersion:first.appVersion,rulesVersion:first.rulesVersion,seedBase:seedBases.length===1?seedBases[0]:null,seedBases,profiles:ranking.length,repetitions:first.repetitions,roundCap:first.roundCap,archetypes:archetypes.map(name=>({name,description:opps.descriptions[name],...archetypeStats[name]})),games:games.length,completed:games.filter(g=>!g.capped).length,capped:games.filter(g=>g.capped).length,wins:games.filter(g=>g.profileOutcome==='win').length,draws:games.filter(g=>g.profileOutcome==='draw').length,losses:games.filter(g=>g.profileOutcome==='loss').length,avgRounds:Math.round(100*games.reduce((s,g)=>s+g.rounds,0)/games.length)/100,endReasons:games.reduce((a,g)=>(a[g.code]=(a[g.code]||0)+1,a),{}),ranking,profileStats,gameRecords:games};
const outDir=path.join(root,'reports');fs.mkdirSync(outDir,{recursive:true});
const seedTag=seedBases.length===1?`seed${seedBases[0]}`:`seeds${seedBases[0]}-${seedBases[seedBases.length-1]}`;
const tag=`v${first.appVersion}-${seedTag}-all-p${ranking.length}-r${first.repetitions}-cap${first.roundCap}`;
const jsonPath=path.join(outDir,`ai-archetype-benchmark-${tag}.json`),mdPath=path.join(outDir,`ai-archetype-benchmark-${tag}.md`);
fs.writeFileSync(jsonPath,JSON.stringify(report,null,2)+'\n');
const lines=[`# NORI V${report.appVersion} — объединённый бенчмарк ИИ`,'',`- Seed: **${seedBases.join(', ')}**; профилей: **${report.profiles}**; партий: **${report.games}**; завершено: **${report.completed}**; лимитированных: **${report.capped}**.`,`- Результаты профиля: **${report.wins} побед**, **${report.draws} ничьих**, **${report.losses} поражений**.`,`- Средняя длина: **${report.avgRounds} раунда**.`, '', '## Результаты по эталонам','','| Соперник | Победы профилей | Ничьи | Поражения профилей | Баллы % | Средние раунды |','|---|---:|---:|---:|---:|---:|',...report.archetypes.map(a=>`| ${a.name} — ${a.description} | ${a.wins} | ${a.draws} | ${a.losses} | ${a.scorePct}% | ${a.avgRounds} |`),'','## Предварительный рейтинг профилей','','| # | Профиль | Партий | Баллы % | Победы % | Ничьи | Поражения | Лимит |','|---:|---|---:|---:|---:|---:|---:|---:|',...ranking.map(p=>`| ${p.rank} | ${p.profile} | ${p.games} | ${p.scorePct}% | ${p.winPct}% | ${p.draws} | ${p.losses} | ${p.capped} |`),'','## Ограничения','','- Все профили являются эвристическими вариациями общего движка, а не 20 независимыми моделями.','- «Тактический» эталон — тот же базовый maximin без профильного смещения.','- Этот рейтинг основан только на указанном seed и этих эталонах; он не является Elo и не доказывает оптимальность.','- Незавершённые по лимиту партии явно отмечены и не считаются ни победой, ни ничьей, ни поражением.',''];
fs.writeFileSync(mdPath,lines.join('\n'));console.log(JSON.stringify({games:report.games,completed:report.completed,capped:report.capped,wins:report.wins,draws:report.draws,losses:report.losses,avgRounds:report.avgRounds,archetypes:report.archetypes.map(a=>({name:a.name,wins:a.wins,draws:a.draws,losses:a.losses,scorePct:a.scorePct})),ranking:ranking.slice(0,20),jsonPath,mdPath},null,2));
