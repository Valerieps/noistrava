// Answers "is everything merged? can I archive?" in one command: every local branch and worktree,
// its PR and whether anything is left unmerged or uncommitted. Squash merges make
// `git branch --merged` useless, so a branch counts as merged when its PR is merged and the
// branch has no commits after the PR's last one.
//
//   npm run branches              report only
//   npm run branches -- --clean   also delete local branches that are merged and not checked out
//
// Needs git and the GitHub CLI (`gh`), signed in.
import { execFileSync } from 'node:child_process';

const clean = process.argv.includes('--clean');
const run = (cmd, args, allowFail = false) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFail) return null;
    console.error(`✗ falhou: ${cmd} ${args.join(' ')}\n${String(error.stderr ?? error.message).trim()}`);
    process.exit(1);
  }
};
const git = (...args) => run('git', args);

git('fetch', '-q', '--prune', 'origin');

// Worktrees: path -> branch, and which ones have uncommitted changes.
const worktrees = git('worktree', 'list', '--porcelain')
  .split(/\r?\n\r?\n/)
  .filter(Boolean)
  .map((entry) => {
    const path = entry.match(/^worktree (.+)$/m)?.[1];
    const branch = entry.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null;
    const dirty = run('git', ['-C', path, 'status', '--porcelain'], true);
    return { path, branch, dirty: dirty === null ? false : dirty !== '' };
  });
const checkedOut = new Map(worktrees.filter((w) => w.branch).map((w) => [w.branch, w]));

// All PRs once, newest first, indexed by head branch.
const prs = JSON.parse(
  run('gh', ['pr', 'list', '--state', 'all', '--limit', '300', '--json', 'number,state,headRefName,headRefOid,url']),
);
const prByBranch = new Map();
for (const pr of prs) if (!prByBranch.has(pr.headRefName)) prByBranch.set(pr.headRefName, pr);

// The local tip is merged when it is the PR's last commit or an ancestor of it (the PR may have
// been updated on GitHub after the local branch stopped). The PR head is fetched when missing.
const containedIn = (tip, pr) => {
  if (pr.headRefOid === tip) return true;
  if (run('git', ['cat-file', '-e', pr.headRefOid], true) === null)
    run('git', ['fetch', '-q', 'origin', `pull/${pr.number}/head`], true);
  return run('git', ['merge-base', '--is-ancestor', tip, pr.headRefOid], true) !== null;
};

const branches = git('for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').filter(Boolean);
const pending = [];
const mergeable = [];
for (const branch of branches) {
  if (branch === 'main') continue;
  const tip = git('rev-parse', branch);
  const ahead = Number(git('rev-list', '--count', `origin/main..${branch}`));
  const pr = prByBranch.get(branch);
  const worktree = checkedOut.get(branch);
  let verdict;
  if (ahead === 0) verdict = 'merged'; // nothing beyond main
  else if (pr?.state === 'MERGED' && containedIn(tip, pr)) verdict = 'merged';
  else if (pr?.state === 'MERGED') verdict = 'commits depois do merge';
  else if (pr?.state === 'OPEN') verdict = `PR aberto #${pr.number}`;
  else if (pr?.state === 'CLOSED') verdict = `PR fechado sem merge #${pr.number}`;
  else verdict = `sem PR (${ahead} commit${ahead > 1 ? 's' : ''})`;
  const row = { branch, verdict, worktree, dirty: worktree?.dirty ?? false, url: pr?.url };
  if (verdict === 'merged' && !row.dirty) mergeable.push(row);
  else pending.push(row);
}

const mainTree = worktrees.find((w) => w.branch === 'main');
if (mainTree?.dirty) pending.push({ branch: 'main', verdict: 'mudanças sem commit na main', dirty: true });

if (pending.length === 0) {
  console.log('✓ Tudo mergeado e nada sem commit: pode arquivar.');
} else {
  console.log('Pendente:');
  for (const row of pending) {
    const where = row.worktree ? `  [worktree ${row.worktree.path}]` : '';
    const dirty = row.dirty && row.branch !== 'main' ? '  + mudanças sem commit' : '';
    if (row.verdict === 'merged') row.verdict = 'nada além da main';
    console.log(`  ✗ ${row.branch}: ${row.verdict}${dirty}${where}${row.url ? `  ${row.url}` : ''}`);
  }
}
if (mergeable.length) {
  console.log(`\nJá mergeadas (${mergeable.length}):`);
  for (const row of mergeable) {
    const where = row.worktree ? `  [worktree ${row.worktree.path}]` : '';
    console.log(`  ✓ ${row.branch}${where}`);
  }
}

if (clean) {
  const removable = mergeable.filter((row) => !row.worktree);
  for (const row of removable) git('branch', '-q', '-D', row.branch);
  console.log(`\n→ apagadas ${removable.length} branch(es) locais mergeadas.`);
  const kept = mergeable.length - removable.length;
  if (kept) console.log(`  ${kept} mergeada(s) seguem abertas num worktree; feche a sessão dela para remover.`);
}
