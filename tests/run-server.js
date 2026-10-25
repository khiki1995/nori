// Run: node tests/run-server.js  (needs `npm install` for the `ws` package)
const path = require('path'); let ws; try { ws = require('ws'); } catch (e) { console.error('The "ws" package is missing. Run `npm install` first.'); process.exit(2); }
(async () => {
  const roomsSuite = require('./server/rooms.test.js'), loop = require('./server/loopback.test.js');
  const all = [].concat(roomsSuite().map(r => ['server-logic', r])); (await loop()).forEach(r => all.push(['loopback-ws', r]));
  let failed = 0; all.forEach(([n, r]) => { if (!r.ok) failed++; console.log((r.ok ? 'OK    ' : 'FAIL  ') + n + ': ' + r.name + (r.ok ? '' : ' -- ' + r.err)); });
  console.log(`\n${all.length - failed}/${all.length} passed, ${failed} failed (ws ${require('ws/package.json').version})`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('runner crashed:', e.message); process.exit(1); });
