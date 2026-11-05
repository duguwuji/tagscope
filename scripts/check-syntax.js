'use strict';
// Syntax-check every JavaScript file, including worker.js as an ES module.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const dirs = ['lib', 'public', 'test', 'scripts'];
const files = [
  'server.js',
  ...dirs.flatMap(dir => fs.readdirSync(path.join(root, dir))
    .filter(name => name.endsWith('.js'))
    .map(name => path.join(dir, name))),
];

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}

// worker.js uses import/export syntax; --check reads it as an ES module from stdin.
const worker = spawnSync(process.execPath, ['--input-type=module', '--check'], {
  input: fs.readFileSync(path.join(root, 'worker.js')),
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (worker.status !== 0) failed++;

if (failed) {
  console.error(`Syntax check failed: ${failed} file(s)`);
  process.exit(1);
}
console.log(`Syntax OK: ${files.length + 1} files`);
