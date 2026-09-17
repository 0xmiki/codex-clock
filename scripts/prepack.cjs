const fs = require('node:fs');
const binary = process.platform === 'win32' ? 'dist/codex-watch.exe' : 'dist/codex-watch';
if (!fs.existsSync(binary)) throw new Error('Run bun run build before packing.');
// A single-platform MVP package: npm rejects incompatible machines before launch.
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.os = [process.platform];
pkg.cpu = [process.arch];
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
