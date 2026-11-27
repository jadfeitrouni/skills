---
name: land
description: "Land the current branch: open its pull request, keep its checks green and the branch mergeable, and merge it when allowed. Use after /implement commits, or to see an open pull request through to its merge."
---

You **land** the current branch: you own its pull request from opening to merge. You merge it yourself only when your
prompt says the work may merge itself. Otherwise the user merges it, and you keep it mergeable until they do. Your
prompt may give signal commands for when the pull request opens, merges or closes, or stops being low-risk: run each
one exactly, at its moment.

`land` below is `node <this skill's directory>/scripts/land.mjs`.

## Reference

- **Default branch**: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.
- **Verify**: the verify command `AGENTS.md` names, run as it describes.
- **Low-risk check**: the check `docs/agents/triage-labels.md` names, run as it says. Without one, nothing merges
  itself: leave the merge to the user.
- **Stop**: give the user one message saying what you need from them and what each choice costs, release the merge
  lock if you hold it (`land unlock`), and end your turn. When they answer, carry on from where you stopped.

## 1. Open

1. If the branch already has an open pull request (`gh pr view --json number,url,state`), it is yours: go to step 2.
2. `git fetch origin`, then rebase onto `origin/<default branch>`. Resolve conflicts with /resolving-merge-conflicts.
   If the base moved, verify again.
3. Push the branch and open a ready pull request into the default branch. Its title follows `AGENTS.md`; its body is
   written with /pr, followed by the review's table and Your steps, and ends `Closes #<n>` when the work is a ticket's.
4. Run the opened signal.

Done when the pull request is open.

## 2. Watch

Run `land watch <number>` as a background task, adding `--self-merge` when the work may merge itself, then end your
turn. It checks once a minute and exits with one JSON line naming the first event: `failing` (with the failed checks
and their links), `conflict`, `ready` (only with `--self-merge`: every check passed and it can merge), `merged`,
`closed` or `error` (GitHub kept failing: stop). Handle the event as step 3 says, then watch again unless that ended
the landing or stopped.

## 3. Handle the event

### failing

Read the failed run's log: `gh run view <run id> --log-failed`.

- The change caused it: fix it, verify, commit and push. When the same check fails after three rounds of fixes, stop.
- The runner caused it (a lost runner, an install step that timed out): `gh run rerun <run id> --failed`, once for
  this head.
- A test the change doesn't explain is flaky: stop, naming the test. It gets fixed or deleted, never rerun until green.

### conflict

Bring the default branch in with a merge (the pull request is public and squash-merges, so its history doesn't
matter): `git fetch origin && git merge origin/<default branch>`, resolving with /resolving-merge-conflicts.

- A migration numbered like one the default branch added: renumber yours to the next free number. A migration
  already on the default branch is never edited.
- A generated file: regenerate it with the command that generates it, rather than merging it by hand.
- Both sides changed the same behaviour in different ways: `git merge --abort` and stop, with both versions.

Verify, commit the merge and push.

### ready

Merges go one at a time, so that each one is verified against the default branch it lands on.

1. `land lock`. It waits while another session merges.
2. Note the head: `gh pr view --json headRefOid --jq .headRefOid`. `git fetch origin`. If `origin/<default branch>`
   has commits the branch lacks, merge it locally and verify: GitHub's squash merge makes this same tree. A conflict
   goes as `conflict` says; a failure as `failing` says. Either way, push the result, `land unlock` and watch again.
   A clean, verified merge stays local.
3. Run the low-risk check. When it fails, the work no longer merges itself: run the not-low-risk signal, tell the user
   which paths it names, `land unlock`, and watch again without `--self-merge`.
4. `gh pr merge <number> --squash --match-head-commit <head>`, then `git push origin --delete <branch>` unless GitHub
   already deleted it.
5. `land unlock`.

### merged

Run the merged signal and tell the user in one line. The landing is done.

### closed

Run the closed signal and tell the user in one line. The landing is done.
