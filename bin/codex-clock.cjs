#!/usr/bin/env node
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Codex Clock requires Node.js 22 or newer.');
  process.exit(1);
}
import('../dist/server.mjs').catch(error => {
  console.error(`Cannot start Codex Clock: ${error.message}`);
  process.exit(1);
});
