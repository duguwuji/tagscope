#!/usr/bin/env node
'use strict';
// TagScope — package.json 版本号递增工具。
//
// 本地手动递增：  node scripts/bump-version.js [patch|minor|major]
// CI 自动递增：   node scripts/bump-version.js --base <基线版本> [--level patch|minor|major]
//
// 带 --base 时，只有当前版本仍等于基线分支的版本才会递增；因此同一个 PR
// 只会自动递增一次，手动改成 minor/major 的 PR 也不会被覆盖。
//
// 递增时会同步 README 与用户手册里的“当前版本”行；这些行是版本声明，
// 与“2.0.1 起需要……”这类历史兼容说明无关，后者不会被改动。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PKG = path.join(ROOT, 'package.json');
const LEVELS = ['patch', 'minor', 'major'];
const VER = '[0-9A-Za-z.+-]+';

// 每项：在哪个文件里替换、匹配什么、替换成什么。
const DOCS = [
  { file: 'README.md', re: new RegExp(`当前版本：\\*\\*${VER}\\*\\*`), text: v => `当前版本：**${v}**` },
  { file: 'README.en.md', re: new RegExp(`Current version: \\*\\*${VER}\\*\\*`), text: v => `Current version: **${v}**` },
  { file: 'docs/user-guide-zh.md', re: new RegExp(`适用版本：TagScope ${VER}（网页版与桥接服务）`), text: v => `适用版本：TagScope ${v}（网页版与桥接服务）` },
  { file: 'docs/user-guide-en.md', re: new RegExp(`Version: TagScope ${VER} \\(web app and bridge\\)`), text: v => `Version: TagScope ${v} (web app and bridge)` },
];

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

function bumpDocText(text, version) {
  return DOCS.reduce((t, d) => t.replace(d.re, d.text(version)), text);
}

function writeVersion(next) {
  const text = fs.readFileSync(PKG, 'utf8');
  const out = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${next}$2`);
  if (out === text) throw new Error('package.json 中没有找到 version 字段');
  fs.writeFileSync(PKG, out);
}

function updateDocs(next) {
  const updated = [];
  for (const d of DOCS) {
    const p = path.join(ROOT, d.file);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    const out = bumpDocText(text, next);
    if (out !== text) { fs.writeFileSync(p, out); updated.push(d.file); }
  }
  return updated;
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
  const updated = updateDocs(next);
  console.log(`version bumped: ${current} -> ${next}${updated.length ? ` (docs: ${updated.join(', ')})` : ''}`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}

module.exports = { bump, parse, bumpDocText, DOCS };
