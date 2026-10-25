(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).games = f; })(this, function (N, H) {
const { suite, eq, deq, ok, C } = H, { results, t } = suite(), S = N.state, G = N.games, RP = N.replay;
const memoryStorage = () => { const data = {}; return { data, getItem: key => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null, setItem: (key, value) => { data[key] = String(value); }, removeItem: key => { delete data[key]; } }; };
const NOOP = [C(2, 'CREATE', '2-7'), C(7, 'CUT', '2-7')];
const finishedSession = () => N.controller.sessionFromState('hvh', [NOOP, NOOP].reduce((state, pair) => S.playRound(state, pair), S.createInitialState()));
t('only finished local games are archived; online and ongoing games are rejected', () => {
  const store = memoryStorage(), ongoing = N.controller.createSession('hvh');
  eq(G.recordFinished(ongoing, store).code, 'NOT_FINISHED');
  eq(G.recordFinished({ mode: 'online', state: { result: { type: 'win' } } }, store).code, 'NOT_FINISHED');
  ok(G.recordFinished(finishedSession(), store).ok); eq(G.list(store).length, 1);
});
t('archive loads and verifies the completed game', () => {
  const store = memoryStorage(); G.recordFinished(finishedSession(), store); const entry = G.list(store)[0];
  ok(entry); eq(entry.rounds, 2); eq(entry.result.code, 'THREEFOLD_REPETITION');
  const loaded = G.load(store, entry.id); ok(loaded.ok); ok(RP.verify(loaded.session.state).ok); eq(G.load(store, 'missing').code, 'NOT_FOUND');
});
t('recording the same finished session repeatedly is idempotent', () => {
  const store = memoryStorage(), session = finishedSession(); G.recordFinished(session, store); G.recordFinished(session, store); eq(G.list(store).length, 1);
});
t('archive is capped at MAX and safely ignores malformed storage', () => {
  const store = memoryStorage(), pairs = [];
  N.C.EDGES.forEach(edge => { const [a, b] = N.graph.edgeEnds(edge); [a, b].forEach(whiteNode => [a, b].forEach(blackNode => pairs.push([C(whiteNode, 'CREATE', edge), C(blackNode, 'CUT', edge)]))); });
  for (let i = 0; i < G.MAX + 5; i++) {
    const pair = pairs[i], terminalState = [pair, pair].reduce((state, choices) => S.playRound(state, choices), S.createInitialState());
    ok(terminalState.result && terminalState.result.code === 'THREEFOLD_REPETITION');
    G.recordFinished(N.controller.sessionFromState('hvh', terminalState), store);
  }
  eq(G.list(store).length, G.MAX);
  store.data[G.KEY] = '{bad'; eq(G.list(store).length, 0);
});
t('remove, clear and storage errors are handled', () => {
  const store = memoryStorage(); G.recordFinished(finishedSession(), store); const id = G.list(store)[0].id;
  ok(G.remove(store, id).ok); eq(G.list(store).length, 0); G.recordFinished(finishedSession(), store); ok(G.clear(store).ok); eq(G.list(store).length, 0);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  eq(G.recordFinished(finishedSession(), broken).ok, false); eq(G.list(broken).length, 0);
});
return results;
});
