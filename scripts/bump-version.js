#!/usr/bin/env node
'use strict';
// TagScope — package.json 版本号递增工具。
//
// 本地手动递增：  node scripts/bump-version.js [patch|minor|major]
// CI 自动递增：   node scripts/bump-version.js --base <基线版本> [--level patch|minor|major]
//
// 带 --base 时，只有当前版本仍等于基线分支的版本才会递增；因此同一个 PR
// 只会自动递增一次，手动改成 minor/major 的 PR 也不会被覆盖。
const fs = require('node:fs');
const path = require('node:path');

const PKG = path.join(__dirname, '..', 'package.json');
const LEVELS = ['patch', 'minor', 'major'];

function parse(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(version || ''));
  if (!m) throw new Error(`无法解析版本号：${version}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function bump(version, level = 'patch') {
  if (!LEVELS.includes(level)) throw new Error(`未知的版本级别：${level}`);
  const v = parse(version);
  if (level === 'major') return `${v.major + 1}.0.0`;
  if (level === 'minor') return `${v.major}.${v.minor + 1}.0`;
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

function writeVersion(next) {
  const text = fs.readFileSync(PKG, 'utf8');
  const out = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${next}$2`);
  if (out === text) throw new Error('package.json 中没有找到 version 字段');
  fs.writeFileSync(PKG, out);
}

function main(argv) {
  const args = argv.slice(2);
  let base = '', level = 'patch';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base') base = args[++i] || '';
    else if (args[i] === '--level') level = args[++i] || 'patch';
    else if (!args[i].startsWith('-')) level = args[i];
  }
  const current = JSON.parse(fs.readFileSync(PKG, 'utf8')).version;
  if (base && current !== base) { console.log(`version unchanged: ${current} (base ${base})`); return 0; }
  const next = bump(current, level);
  writeVersion(next);
  console.log(`version bumped: ${current} -> ${next}`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}

module.exports = { bump, parse, writeVersion };
