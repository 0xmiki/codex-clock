const fs = require('node:fs');
for (const path of ['dist/server.mjs', 'dist/web/index.html']) {
  if (!fs.existsSync(path)) throw new Error('Run bun run build before packing. Missing ' + path);
}
