#!/usr/bin/env node
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Codex Watch requires Node.js 22 or newer.');
  process.exit(1);
}
import('../dist/server.mjs').catch(error => {
  console.error(`Cannot start Codex Watch: ${error.message}`);
  process.exit(1);
});
