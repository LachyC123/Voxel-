// Builds play.html: the whole game in one file that runs by double-clicking it
// (no install, no server). Run with: npm run build:single
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const asset = (rel) => fs.readFileSync(path.join(dist, rel.replace(/^\.?\//, '')), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/, (_, href) => `<style>${asset(href)}</style>`);
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/, '');
const js = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.js'));
if (js.length !== 1) throw new Error(`expected one script chunk, found ${js.length}`);
const code = asset('assets/' + js[0]).replace(/<\/script/gi, '<\\/script');
html = html.replace('</body>', () => `<script type="module">${code}</script>\n</body>`);
if (/src="\.?\/assets|href="\.?\/assets/.test(html)) throw new Error('an external asset reference is left in the page');
const out = path.join(__dirname, '..', 'play.html');
fs.writeFileSync(out, html);
console.log(`play.html written (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
