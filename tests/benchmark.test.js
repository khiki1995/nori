(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).benchmark = f; })(this, function (N, H) {
'use strict';
const { suite, eq, deq, ok, C } = H, { results, t } = suite();
const { createOpponentSet } = require('../tools/archetype-opponents.js');
const opponents = createOpponentSet(N), state = N.state.createInitialState();
const valid = c => { N.rules.validateChoice(c); ok(N.C.NODES.includes(c.node)); ok(N.C.EDGES.includes(c.edge)); ok(N.C.ACTIONS.includes(c.action)); };
t('four reference opponents are available and documented', () => { deq(opponents.names, ['random', 'aggressive', 'defensive', 'tactical']); opponents.names.forEach(n => ok(opponents.descriptions[n].length > 20)); });
t('each archetype returns a valid game choice for either side', () => { for (const name of opponents.names) for (const player of [0,1]) valid(opponents.choose(name, state, player, { seed: 12345 })); });
t('random baseline is reproducible for the same seed, round and position', () => { deq(opponents.choose('random', state, 0, { seed: 42 }), opponents.choose('random', state, 0, { seed: 42 })); });
t('random baseline responds to a different seed', () => { const keys = new Set(Array.from({length:20},(_,i)=>JSON.stringify(opponents.choose('random', state, 0, {seed:i+100})))); ok(keys.size > 1, 'expected multiple random choices'); });
t('tactical baseline is exactly the unprofiled maximin engine', () => { deq(opponents.choose('tactical', state, 1, {seed:77}), N.ai.chooseAIAction(state,1)); });
t('greedy baselines can complete a legal round against the default engine', () => { for (const name of ['aggressive','defensive']) { const pair = [N.ai.chooseAIAction(state,0), opponents.choose(name,state,1,{seed:991})]; pair.forEach(N.rules.validateChoice); const next=N.state.playRound(state,pair); ok(next.rounds.length===1); ok(Array.isArray(next.edges)); } });
return results;
});
