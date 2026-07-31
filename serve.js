const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((q, r) => {
  let u = q.url.split('?')[0];
  if (u === '/') u = '/index.html';
  const fp = path.join(root, u);
  fs.readFile(fp, (e, d) => {
    if (e) {
      r.writeHead(404);
      r.end('404 ' + u);
    } else {
      const ext = path.extname(fp).toLowerCase();
      r.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      r.end(d);
    }
  });
});

server.listen(8080, () => console.log('Server running at http://localhost:8080'));
