// Builds the claude.ai Artifact version of the app from index.html (the single source of truth).
//   node tools/build-artifact.js
// Writes dist/artifact.html (the page without <html>/<head>/<body>, which the Artifact host adds),
// dist/preview.html (the same page inside a mock skeleton, for local testing), and prints the files to publish with it.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || 'Closed Jar Simulator';
const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
const body = (html.match(/<body>([\s\S]*?)<\/body>/) || [])[1];
if (!style || !body) throw new Error('index.html does not have the expected <style> and <body> blocks');

const fragment =
  '<title>' + title + '</title>\n' +
  '<meta name="claude:viewport-fit-sides" content="cover">\n' +
  '<style>' + style + '</style>\n' + body.trim() + '\n';

const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'artifact.html'), fragment);

// a stand-in for the host's skeleton, so the fragment can be opened locally (relative paths point back at the project)
const preview = '<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="../">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}[hidden]{display:none!important}</style></head><body>' +
  fragment + '</body></html>';
fs.writeFileSync(path.join(dist, 'preview.html'), preview);

const files = [];
(body.match(/<script src="([^"]+)"/g) || []).forEach(m => { const src = m.slice(13, -1); if (!/^https?:/.test(src)) files.push(src); });
const missing = files.filter(f => !fs.existsSync(path.join(root, f)));
const bytes = files.concat(['dist/artifact.html']).reduce((a, f) => a + fs.statSync(path.join(root, f)).size, 0);
console.log('page      : dist/artifact.html (' + fragment.length + ' bytes)');
console.log('also files: ' + files.join(', '));
console.log('total     : ' + (bytes / 1024).toFixed(0) + ' KB' + (missing.length ? '   MISSING: ' + missing.join(', ') : ''));
console.log(JSON.stringify(files.reduce((o, f) => { o[f] = f; return o; }, {})));
