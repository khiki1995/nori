(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).tasks = f; })(this, function (N, H, env) {
const { suite, eq, deq, ok, C } = H, { results, t } = suite(), T = N.tasks, D = N.tasksData, R = N.rules, S = N.state; env = env || {};
const mem = () => { const m = {}; return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
t('catalogue: 8-12 tasks with unique ids in 5 categories, at least 3 tutorials, texts in en and ru', () => {
  ok(D.length >= 8 && D.length <= 12, 'count ' + D.length); eq(new Set(D.map(x => x.id)).size, D.length); T.CATEGORIES.forEach(c => ok(D.some(x => x.category === c), 'category ' + c)); ok(D.filter(x => x.category === 'tutorial').length >= 3);
  D.forEach(x => ['en', 'ru'].forEach(l => ['title', 'desc', 'explain'].forEach(k => ok(x.text[l] && x.text[l][k] && x.text[l][k].length > (k === 'title' ? 3 : 15), `${x.id} ${l}.${k}`))));
});
t('every task validates against the REAL engine (stored expectations == computed results)', () => D.forEach(x => T.validateTask(x)));
t('the validator really catches wrong stored answers (mutated copies are rejected)', () => {
  const bad = (id, mut) => { const c = JSON.parse(JSON.stringify(D.find(x => x.id === id))); mut(c); let threw = false; try { T.validateTask(c); } catch (e) { threw = true; } ok(threw, id + ' mutation accepted'); };
  bad('tut-commit', c => { c.expectedItems = [0, 1]; }); bad('tut-resolve-win', c => { c.expectedExists = !c.expectedExists; }); bad('conn-1', c => { c.expectedEdges = ['1-2']; }); bad('def-1', c => { c.expectedClasses.pop(); });
  bad('atk-2', c => { c.expectedClasses = ['6-7|CUT|U']; }); bad('chl-1', c => { c.limit = 2; }); bad('chl-1', c => { c.reference = c.reference.slice(0, 2); }); bad('chl-2', c => { c.minimalRounds = 3; });
});
t('action tasks: the accepted set is exactly the classes that hold against all 56 replies, and every rejected class has a counter-reply that beats it (replayed with the engine)', () => {
  D.filter(x => x.kind === 'action').forEach(task => {
    const st = T.makeState(task.position), rows = T.analyze(st, task.me), acc = new Set(T.acceptedClasses(task));   // one analysis per task: 56x56 engine steps
    eq(rows.filter(r => r[task.goal]).length, acc.size, task.id + ' accepted count');
    rows.forEach(r => {
      eq(!!r[task.goal], acc.has(r.cls), task.id + ' ' + r.cls);
      if (!r[task.goal]) { const counter = task.goal === 'forced' ? r.counterForced : r.counterBroken, pair = task.me === 0 ? [r.choice, counter] : [counter, r.choice], s = S.stepCore(st.edges, st.streak, st.seen, pair);
        if (task.goal === 'notBroken') ok(R.isBroken(s.resolved.edges, task.me), task.id + ' counter must break me: ' + r.cls); else ok(!(s.result && s.result.type === 'win' && s.result.winner === task.me), task.id + ' counter must stop the win: ' + r.cls); }
    });
    const some = rows.filter(r => r[task.goal]).slice(0, 2).concat(rows.filter(r => !r[task.goal]).slice(0, 2));   // the public checker agrees on a sample
    some.forEach(r => eq(T.checkAction(task, r.choice).ok, !!r[task.goal], task.id + ' checkAction ' + r.cls));
  });
});
t('action tasks: accepted answers depend on the commitment, not on the node (any end of the link works, a non-end does not)', () => {
  const a2 = D.find(x => x.id === 'atk-2'); ok(T.checkAction(a2, { node: 6, action: 'CUT', edge: '6-7' }).ok); ok(T.checkAction(a2, { node: 7, action: 'CUT', edge: '6-7' }).ok); eq(T.checkAction(a2, { node: 2, action: 'CUT', edge: '6-7' }).ok, false);
  const d2 = D.find(x => x.id === 'def-2'); ok(T.checkAction(d2, { node: 1, action: 'CREATE', edge: '1-10' }).ok && T.checkAction(d2, { node: 10, action: 'CREATE', edge: '1-10' }).ok); eq(T.checkAction(d2, { node: 3, action: 'CREATE', edge: '1-10' }).ok, false);
  const d1 = D.find(x => x.id === 'def-1'); eq(T.checkAction(d1, { node: 4, action: 'CREATE', edge: '4-5' }).ok, false, 'the tempting reconnect through the same chain must fail');
});
t('invalid choices are rejected by the task checker (engine validation)', () => { const d1 = D.find(x => x.id === 'def-1'); ['x', null, { node: 11, action: 'CUT', edge: '1-2' }, { node: 1, action: 'cut', edge: '1-2' }, { node: 1, action: 'CUT', edge: '1-5' }].forEach(c => { let threw = false; try { T.checkAction(d1, c); } catch (e) { threw = true; } ok(threw, JSON.stringify(c)); }); });
t('commit / resolve / bridge kinds: engine answers equal the stored ones and wrong answers differ', () => {
  const c = D.find(x => x.id === 'tut-commit'); deq(T.committedItems(c), [0, 2, 3, 5]); ok(!T.sameSet([0, 2, 3], T.committedItems(c)));
  const w = D.find(x => x.id === 'tut-resolve-win'), cf = D.find(x => x.id === 'tut-resolve-conflict'), df = D.find(x => x.id === 'tut-resolve-different'); eq(T.resolvedExists(w), true); eq(T.resolvedExists(cf), false); eq(T.resolvedExists(df), true);
  deq(T.bridgeSet(D.find(x => x.id === 'conn-1')), ['1-2', '2-3', '3-4']); deq(T.bridgeSet(D.find(x => x.id === 'conn-2')), ['1-2', '2-3', '3-8']);
});
t('challenges: the reference wins within the limit, a slower or failing line does not, and the limit is enforced round by round', () => {
  D.filter(x => x.kind === 'challenge').forEach(task => {
    const p = T.playSequence(task, task.reference); eq(p.status, 'won', task.id); eq(p.state.result.winner, task.me); eq(p.state.rounds.length, task.minimalRounds);
    const idle = T.playSequence(task, Array.from({ length: task.limit }, () => ({ node: 1, action: 'CREATE', edge: '1-2' }))); ok(idle.status === 'failed', task.id + ' passive play must not win');
    let st = T.challengeStart(task); eq(T.challengeStatus(task, st), 'ongoing'); for (let i = 0; i < task.limit; i++) { if (st.result) break; st = T.challengeStep(task, st, { node: 1, action: 'CREATE', edge: '1-2' }); } ok(['failed'].includes(T.challengeStatus(task, st)));
  });
  const c1 = D.find(x => x.id === 'chl-1'); eq(T.playSequence(c1, c1.reference.slice(0, 2)).status, 'ongoing'); eq(T.minimalRounds(c1, 2), null, 'no 2-round win exists');
});
t('challenge opponents are scripted and deterministic (same play, same result)', () => { const c = D.find(x => x.id === 'chl-2'); deq(T.playSequence(c, c.reference).state, T.playSequence(c, c.reference).state); });
t('progress storage round-trips, ignores garbage and survives a failing storage', () => {
  const st = mem(); deq(T.loadProgress(st), { solved: {}, attempts: {} }); ok(T.saveProgress(st, { solved: { a: true }, attempts: { a: 2 } })); deq(T.loadProgress(st), { solved: { a: true }, attempts: { a: 2 } });
  st.m[T.KEY] = '{oops'; deq(T.loadProgress(st), { solved: {}, attempts: {} }); st.m[T.KEY] = '{"solved":5,"attempts":"x"}'; deq(T.loadProgress(st), { solved: {}, attempts: {} });
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }; deq(T.loadProgress(bad), { solved: {}, attempts: {} }); eq(T.saveProgress(bad, {}), false);
});
return results;
});
