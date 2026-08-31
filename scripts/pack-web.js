const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dest = path.join(root, 'www');

function copy(src, to) {
  const from = path.join(root, src);
  const out = path.join(dest, to || src);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.cpSync(from, out, { recursive: true });
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

[
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'sw.js',
].forEach(f => copy(f));
copy('js', 'js');
copy('icons', 'icons');

console.log('www/ prêt pour Capacitor (iOS / Android).');
