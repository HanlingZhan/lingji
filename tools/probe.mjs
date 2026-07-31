import http from 'http';
const u = process.argv[2];
const paths = ['/', '/manifest.webmanifest', '/sw.js', '/assets/icon-192.png', '/assets/apple-touch-icon.png', '/assets/icon.svg'];
let i = 0;
function n() {
  if (i >= paths.length) return;
  const p = paths[i++];
  http.get(u + p, res => {
    let b = 0; res.on('data', d => b += d.length);
    res.on('end', () => { console.log(p, '->', res.statusCode, (res.headers['content-type'] || '').split(';')[0], b + 'b'); n(); });
  }).on('error', e => { console.log(p, 'ERR', e.message); n(); });
}
n();
