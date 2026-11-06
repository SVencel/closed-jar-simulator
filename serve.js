// Tiny static server (no dependencies): node serve.js [port]
// Open the printed address on this computer, or on a phone connected to the same Wi-Fi.
// (index.html also works by double-clicking it on the computer; the phone needs this server.)
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const port = +process.argv[2] || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(__dirname, url === '/' ? 'index.html' : url);
  if (!file.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '0.0.0.0', () => {
  console.log('Closed Jar Simulator is running.\n');
  console.log('  On this computer:  http://localhost:' + port);
  const lan = [];
  Object.values(os.networkInterfaces()).forEach(list => (list || []).forEach(i => { if (i.family === 'IPv4' && !i.internal) lan.push(i.address); }));
  if (lan.length) {
    console.log('  On your phone (same Wi-Fi):');
    lan.forEach(a => console.log('                     http://' + a + ':' + port));
    console.log('\n  If the phone cannot connect, allow Node.js through the Windows firewall for private networks when Windows asks.');
  } else console.log('  (no network address found: connect to Wi-Fi to use it from a phone)');
  console.log('\n  Press Ctrl+C to stop.');
});
