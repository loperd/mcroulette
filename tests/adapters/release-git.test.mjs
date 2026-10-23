import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitSquashedRelease } from '../../scripts/release-git.mjs';

async function repository() {
  const cwd = await mkdtemp(join(tmpdir(), 'release-git-test-'));
  const run = (command, args, options = {}) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
  const git = (...args) => run('git', args);
  git('init', '-b', 'master'); git('config', 'user.name', 'Release test'); git('config', 'user.email', 'test@example.invalid');
  await writeFile(join(cwd, 'base.txt'), 'base'); git('add', '.'); git('commit', '-m', 'base'); git('tag', '0.3.9');
  const base = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/master', base);
  for (const name of ['one', 'two']) {
    await writeFile(join(cwd, `${name}.txt`), name); git('add', '.'); git('commit', '-m', name);
  }
  await rm(join(cwd, 'base.txt')); await writeFile(join(cwd, 'one.txt'), 'changed'); await writeFile(join(cwd, 'new.txt'), 'new');
  return { cwd, run, git, base, previous: git('rev-parse', 'HEAD'), cleanup: () => rm(cwd, { recursive: true, force: true }) };
}

test('release combines local commits, edits, new files and deletions into one commit with a backup', async () => {
  const r = await repository();
  try {
    const commit = commitSquashedRelease({ ...r, base: '0.3.9', version: '0.3.10', message: 'release\n' });
    assert.equal(r.git('rev-parse', `${commit}^`), r.base);
    assert.equal(r.git('rev-list', '--count', '0.3.9..HEAD'), '1');
    assert.equal(r.git('status', '--porcelain'), '');
    assert.equal(await readFile(join(r.cwd, 'one.txt'), 'utf8'), 'changed');
    assert.equal(await readFile(join(r.cwd, 'new.txt'), 'utf8'), 'new');
    await assert.rejects(readFile(join(r.cwd, 'base.txt')), { code: 'ENOENT' });
    const backup = r.git('for-each-ref', '--format=%(objectname)', 'refs/heads/release-backup/');
    assert.equal(backup, r.previous);
  } finally { await r.cleanup(); }
});

test('release refuses to squash commits already published after the previous tag', async () => {
  const r = await repository();
  try {
    r.git('update-ref', 'refs/remotes/origin/master', r.previous);
    const status = r.git('status', '--porcelain');
    assert.throws(() => commitSquashedRelease({ ...r, base: '0.3.9', version: '0.3.10', message: 'release\n' }));
    assert.equal(r.git('rev-parse', 'HEAD'), r.previous);
    assert.equal(r.git('status', '--porcelain'), status);
  } finally { await r.cleanup(); }
});

test('a failed squash commit restores HEAD and retains every staged change', async () => {
  const r = await repository();
  try {
    const run = (command, args, options) => {
      if (command === 'git' && args[0] === 'commit') throw new Error('commit rejected');
      return r.run(command, args, options);
    };
    assert.throws(() => commitSquashedRelease({ ...r, run, base: '0.3.9', version: '0.3.10', message: 'release\n' }), /commit rejected/);
    assert.equal(r.git('rev-parse', 'HEAD'), r.previous);
    assert.equal(await readFile(join(r.cwd, 'new.txt'), 'utf8'), 'new');
    assert.ok(r.git('diff', '--cached', '--name-only').includes('new.txt'));
  } finally { await r.cleanup(); }
});
