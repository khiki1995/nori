'use strict';
// Public client files only: never server/, backups, node_modules or the Node/Python-only test runners.
const fs = require('fs'), path = require('path'), { withSecurity } = require('./http.js');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.json': 'application/json; charset=utf-8' };
const PUBLIC_FILES = new Set(['/index.html', '/styles.css', '/manifest.webmanifest', '/src/bots-data.json', '/tests/harness.js']);
const PUBLIC_PATTERNS = [/^\/assets\/sounds\/[A-Za-z0-9._-]+\.wav$/, /^\/icons\/[A-Za-z0-9._-]+\.(png|svg)$/, /^\/src\/[A-Za-z0-9._-]+\.js$/, /^\/tests\/[A-Za-z0-9._-]+\.test\.js$/];
function staticPath(urlPath) {
  let p; try { p = decodeURIComponent(urlPath.split('?')[0]); } catch (e) { return null; }
  if (p === '/') p = '/index.html';
  if (/[\0\\]|\.\./.test(p)) return null;
  return PUBLIC_FILES.has(p) || PUBLIC_PATTERNS.some(re => re.test(p)) ? path.join(ROOT, p) : null;
}
function notFound(res) { res.writeHead(404, withSecurity({ 'Content-Type': 'text/plain; charset=utf-8' })); res.end('Not found'); }
function serveStatic(req, res) {
  const file = staticPath(req.url || '/'); if (!file) return notFound(res);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    // no-cache = revalidate on every load: friends never keep a stale JS after a deploy
    const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`, h = withSecurity({ 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag });
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); return res.end(); }
    res.writeHead(200, Object.assign({ 'Content-Length': st.size }, h)); if (req.method === 'HEAD') return res.end(); fs.createReadStream(file).pipe(res);
  });
}
module.exports = { ROOT, staticPath, serveStatic };
