// Run: node tests/run.js  (exit code 0 only if every test passes)
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const H = require('./harness.js');
['constants', 'graph', 'rules', 'state', 'ai', 'controller', 'storage', 'online', 'sound', 'tasks', 'tasks-data', 'replay', 'games', 'lab'].forEach(f => require(path.join(root, 'src', f + '.js')));
const N = globalThis.NORI, I18N = require(path.join(root, 'src', 'i18n.js'));
const names = ['graph', 'resolution', 'terminal', 'repetition', 'symmetry', 'ai', 'ui-smoke', 'i18n', 'online-client', 'sound', 'tasks', 'replay', 'games', 'lab', 'benchmark'];
let total = 0, failed = 0;
names.forEach(n => {
  const file = path.join(__dirname, n + '.test.js'); if (!fs.existsSync(file)) { console.log(`SKIP  ${n} (no test file yet)`); return; }
  const res = require(file)(N, H, { fs, path, root, I18N });
  res.forEach(r => { total++; if (!r.ok) failed++; console.log((r.ok ? 'OK    ' : 'FAIL  ') + n + ': ' + r.name + (r.ok ? '' : ' -- ' + r.err)); });
});
console.log(`\n${total - failed}/${total} passed, ${failed} failed`);
process.exit(failed || !total ? 1 : 0);
