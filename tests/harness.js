(function (root, f) { if (typeof module === 'object') module.exports = f(); else root.NORI_HARNESS = f(); })(this, function () {
  const suite = () => { const results = []; const t = (name, fn) => { try { const r = fn(); results.push(r === 'SKIP' ? { name, ok: true, skipped: true } : { name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message }); } }; return { results, t }; };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'expected'}: ${b}, got ${a}`); };
  const deq = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);
  const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
  const throwsCode = (fn, code) => { try { fn(); } catch (e) { if (e.code === code) return; throw new Error('wrong error ' + e.code + ', expected ' + code); } throw new Error('no error, expected ' + code); };
  const C = (node, action, edge) => ({ node, action, edge });
  return { suite, eq, deq, ok, throwsCode, C };
});
