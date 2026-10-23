/** Squash unpublished commits and the current working tree without rewriting released history. */
export function commitSquashedRelease({ git, run, base, version, message }) {
  const parent = git('rev-parse', `${base}^{commit}`), previous = git('rev-parse', 'HEAD');
  // Anything already published after the base must not be rewritten or force-pushed.
  run('git', ['merge-base', '--is-ancestor', 'origin/master', parent]);
  run('git', ['add', '--all']);
  run('git', ['diff', '--cached', '--check']);
  if (previous !== parent) {
    run('git', ['branch', `release-backup/${version}-${Date.now()}`, previous]);
    // Soft reset preserves every staged file and every working-tree byte, including deletions.
    run('git', ['reset', '--soft', parent]);
  }
  try { run('git', ['commit', '--file', '-'], { input: message }); }
  catch (error) {
    if (previous !== parent) run('git', ['reset', '--soft', previous]);
    throw error;
  }
  return git('rev-parse', 'HEAD');
}
