// Reads JSON cases from stdin, evaluates them with the real JS engine, prints JSON. Used only by test_analysis.py.
const path = require('path'), root = path.join(__dirname, '..', '..');
['constants', 'graph', 'rules', 'state'].forEach(f => require(path.join(root, 'src', f + '.js')));
const N = globalThis.NORI; let raw = ''; process.stdin.on('data', d => raw += d).on('end', () => {
  const input = JSON.parse(raw), list = Array.isArray(input) ? input : input.pairs.map(pr => ({ edges: input.edges, streak: input.streak, seen: input.seen, choices: pr })); // {state + pairs} mode avoids resending the state
  const out = list.map(c => {
    const st = { edges: c.edges, streak: c.streak, seen: c.seen }, s = N.state.stepCore(c.edges, c.streak, c.seen, c.choices);
    return { edges: s.resolved.edges, streak: s.streak, code: s.result ? s.result.code : null, winner: s.result ? s.result.winner : null, seenKey: s.seenKey, seenCount: s.seenCount, fullKey: N.rules.makeFullKey(st) };
  });
  process.stdout.write(JSON.stringify(out));
});
