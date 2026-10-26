// Checks the docs the way CI does (`npm run docs:check`):
// 1. every relative link in a Markdown file points to a file that exists;
// 2. every ADR (docs/adr/NNN-*.md) has a `**Status:**` line, since there is no separate index,
//    and a number no other ADR uses.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', '.git', '.claude']);

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

const problems = [];
const LINK = /\]\(([^)\s]+)\)/g;

for (const file of markdownFiles(root)) {
  // Links inside code blocks and inline code are examples, not links.
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const [, target] of text.matchAll(LINK)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split('#')[0].replace(/:\d+$/, ''));
    if (path && !existsSync(resolve(dirname(file), path))) {
      problems.push(`${relative(root, file)}: link quebrado para ${target}`);
    }
  }
}

const adrDir = join(root, 'docs', 'adr');
const adrByNumber = new Map();
for (const name of readdirSync(adrDir)) {
  if (!/^\d{3}-.+\.md$/.test(name) || name.startsWith('000-')) continue;
  if (!/^\*\*Status:\*\* .+/m.test(readFileSync(join(adrDir, name), 'utf8'))) {
    problems.push(`docs/adr/${name}: falta a linha **Status:**`);
  }
  // "ADR-012" must name one decision: two branches picking the same next number collide here.
  const number = name.slice(0, 3);
  if (adrByNumber.has(number)) problems.push(`docs/adr/${name}: o número ${number} já é de ${adrByNumber.get(number)}`);
  else adrByNumber.set(number, name);
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('docs ok');
