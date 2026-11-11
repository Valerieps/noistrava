// Ships the current work to main in one command: commit, push, open (or reuse) the PR, turn on
// auto-merge and wait until GitHub merges it (ADR-003). Replaces the manual
// "create PR, watch checks, update branch, merge, clean up" loop.
//
//   npm run ship -- "Mensagem do commit"      commit everything, open the PR, wait for the merge
//   npm run ship -- "Mensagem" --no-wait      stop after turning on auto-merge
//   npm run ship                               nothing to commit: ship the commits already on the branch
//
// On main, a branch is created from the message. Needs git and the GitHub CLI (`gh`), signed in.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));
const message = args.filter((arg) => !arg.startsWith('--')).join(' ').trim();
const wait = !flags.has('--no-wait');
const TIMEOUT_MS = 30 * 60 * 1000;

const run = (cmd, cmdArgs, { quiet = false, allowFail = false } = {}) => {
  try {
    return execFileSync(cmd, cmdArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', quiet ? 'pipe' : 'inherit'],
    }).trim();
  } catch (error) {
    if (allowFail) return null;
    console.error(`\n✗ falhou: ${cmd} ${cmdArgs.join(' ')}`);
    if (error.stdout) console.error(String(error.stdout).trim());
    if (error.stderr) console.error(String(error.stderr).trim());
    process.exit(1);
  }
};
const git = (...a) => run('git', a);
const gh = (...a) => run('gh', a);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (text) => {
  console.error(`✗ ${text}`);
  process.exit(1);
};

const slug = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '');

// 1. Branch: never commit on main.
let branch = git('branch', '--show-current');
if (!branch) fail('HEAD destacado: faça checkout de uma branch primeiro.');
const dirty = git('status', '--porcelain') !== '';
if (branch === 'main') {
  if (!dirty) fail('Na main, sem mudanças: nada para subir.');
  if (!message) fail('Na main é preciso uma mensagem: npm run ship -- "Mensagem do commit"');
  branch = slug(message) || `ship-${Date.now()}`;
  if (run('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { allowFail: true, quiet: true }))
    branch = `${branch}-${Date.now().toString(36)}`;
  git('switch', '-q', '-c', branch);
  console.log(`→ branch nova: ${branch}`);
}

// 2. Commit whatever is pending.
if (dirty) {
  if (!message) fail('Há mudanças sem commit: passe a mensagem, npm run ship -- "Mensagem do commit"');
  git('add', '-A');
  git('commit', '-q', '-m', message);
  console.log(`→ commit: ${message}`);
}

git('fetch', '-q', 'origin', 'main');
const ahead = Number(git('rev-list', '--count', `origin/main..HEAD`));
if (ahead === 0) fail(`A branch ${branch} não tem commits além da main: nada para subir.`);

// 3. Push and open (or reuse) the PR.
git('push', '-q', '-u', 'origin', branch);
console.log(`→ push: ${branch} (${ahead} commit${ahead > 1 ? 's' : ''})`);

const existing = run('gh', ['pr', 'view', branch, '--json', 'number,state,url'], { allowFail: true, quiet: true });
let pr = existing ? JSON.parse(existing) : null;
if (!pr || pr.state !== 'OPEN') {
  const subjects = git('log', '--reverse', '--format=%s', 'origin/main..HEAD').split('\n');
  const title = message || subjects[0];
  const body = subjects.map((subject) => `- ${subject}`).join('\n');
  gh('pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body', body);
  pr = JSON.parse(gh('pr', 'view', branch, '--json', 'number,state,url'));
  console.log(`→ PR aberto: ${pr.url}`);
} else {
  console.log(`→ PR existente: ${pr.url}`);
}

// 4. Auto-merge: GitHub merges by itself once the "build" check passes.
gh('pr', 'merge', String(pr.number), '--auto', '--squash');
console.log('→ merge automático ligado');
if (!wait) {
  console.log(`✓ pronto. O GitHub faz o merge quando o build passar: ${pr.url}`);
  process.exit(0);
}

// 5. Wait: watch the checks, bring the branch up to date when main moved, until it is merged.
const started = Date.now();
const view = () => JSON.parse(gh('pr', 'view', String(pr.number), '--json', 'state,mergeStateStatus'));
while (true) {
  if (Date.now() - started > TIMEOUT_MS) fail(`Tempo esgotado esperando o merge: ${pr.url}`);
  const { state, mergeStateStatus } = view();
  if (state === 'MERGED') break;
  if (state === 'CLOSED') fail(`O PR foi fechado sem merge: ${pr.url}`);
  if (mergeStateStatus === 'BEHIND') {
    console.log('→ a main andou: atualizando a branch');
    gh('pr', 'update-branch', String(pr.number));
    await sleep(5000);
    continue;
  }
  if (mergeStateStatus === 'DIRTY') fail(`Conflito com a main: resolva e rode npm run ship de novo. ${pr.url}`);
  // Checks may take a few seconds to register after a push; --watch blocks until they finish.
  const checks = run('gh', ['pr', 'checks', String(pr.number), '--watch', '--fail-fast', '--interval', '15'], {
    allowFail: true,
    quiet: true,
  });
  if (checks === null) {
    const status = run('gh', ['pr', 'checks', String(pr.number)], { allowFail: true, quiet: true }) ?? '';
    if (/\bfail\b/i.test(status)) {
      console.error(status);
      fail(`O build falhou: ${pr.url}`);
    }
  }
  await sleep(5000);
}
console.log(`✓ mergeado: ${pr.url}`);

// 6. Clean up locally: back to an up-to-date main, branch removed.
const here = git('rev-parse', '--show-toplevel');
const mainElsewhere = git('worktree', 'list', '--porcelain')
  .split(/\r?\n\r?\n/)
  .some((entry) => entry.includes('branch refs/heads/main') && !entry.startsWith(`worktree ${here}\n`));
if (mainElsewhere) {
  git('fetch', '-q', 'origin', 'main');
  console.log('  (main está aberta em outro worktree: esta branch fica aqui; rode npm run branches -- --clean depois)');
} else {
  git('switch', '-q', 'main');
  git('pull', '-q', '--ff-only');
  git('branch', '-q', '-D', branch);
  console.log('→ de volta na main, atualizada; branch local apagada');
}
