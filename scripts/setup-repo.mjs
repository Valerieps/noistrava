// Applies the repository settings a GitHub template does not copy: labels, merge settings and
// the protection of main (ADR-003). Run once per new repository: `npm run setup:repo`.
// Needs the GitHub CLI (`gh`), signed in with access to the repository.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const gh = (args, input) =>
  execFileSync('gh', args, { encoding: 'utf8', input, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });

const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
console.log(`Configurando ${repo}`);

// Labels: create or update every label in .github/labels.json; GitHub's defaults go away.
const labels = JSON.parse(readFileSync(new URL('../.github/labels.json', import.meta.url), 'utf8'));
const wanted = new Set(labels.map((label) => label.name));
for (const { name, color, description } of labels) {
  gh(['label', 'create', name, '--color', color, '--description', description, '--force']);
}
const existing = JSON.parse(gh(['label', 'list', '--limit', '200', '--json', 'name']));
for (const { name } of existing) {
  if (!wanted.has(name)) gh(['label', 'delete', name, '--yes']);
}
console.log(`  labels: ${labels.length}`);

// Merge settings: PRs only, merged automatically once checks pass, branch deleted afterwards.
gh(['repo', 'edit', repo, '--enable-auto-merge', '--delete-branch-on-merge', '--enable-wiki=false', '--enable-projects=false']);
console.log('  merge automático e apagar a branch depois do merge: ligados; wiki e projects: desligados');

// Protection of main: the CI build must pass on a branch up to date with main; no direct pushes.
const protection = {
  required_status_checks: { strict: true, contexts: ['build'] },
  enforce_admins: true,
  required_pull_request_reviews: null,
  restrictions: null,
  allow_force_pushes: false,
  allow_deletions: false,
};
try {
  gh(['api', '-X', 'PUT', `repos/${repo}/branches/main/protection`, '--input', '-'], JSON.stringify(protection));
  console.log('  main protegida: exige o check "build" e a branch atualizada');
} catch (error) {
  // Private repositories on the free plan cannot protect branches.
  console.warn('  main NÃO foi protegida (repositório privado no plano gratuito?):');
  console.warn(`  ${String(error.stderr ?? error.message).trim()}`);
}
