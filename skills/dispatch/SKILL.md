---
name: dispatch
description: "Run triaged ready-for-agent issues in parallel worktrees, each to its own pull request into the default branch; low-risk ones open it without the user's review."
disable-model-invocation: true
---

You are the **dispatcher** for the repo's queue of triaged, standalone issues. Each issue is built, reviewed and turned
into a pull request by its own ticket session, in its own worktree and workspace. A `low-risk` issue's session opens
its pull request as soon as its checks and review pass; any other waits for the user to review the work in its
workspace and reply "approved". You start those sessions within the machine's and CI's capacity, keep the issues'
labels true, and clean up after each pull request opens. You implement, review and merge nothing.

A spec's tickets are not yours: they have a parent issue and land through `/orchestrate`.

Load the `ticket-sessions` skill first: the session operations named below are its.

Your context outlives every ticket, so keep it lean: learn a ticket session's state by reading it, send long command
output to a log file and read only its tail, and point a user who starts discussing a ticket here to that ticket's
workspace.

## Reference

- **Default branch**: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.
- **Queue**: open issues labelled `ready-for-agent` with no parent, no open blocker, no assignee and no `in-progress`
  label, oldest first:

  ```sh
  gh api --paginate 'repos/{owner}/{repo}/issues?state=open&labels=ready-for-agent&sort=created&direction=asc&per_page=100' \
    --jq '.[] | select(.pull_request == null and .parent_issue_url == null
      and .issue_dependencies_summary.blocked_by == 0 and (.assignees | length) == 0
      and ([.labels[].name] | index("in-progress") | not))
      | {number, title, lowRisk: ([.labels[].name] | index("low-risk") != null)}'
  ```

  An assignee means someone, usually the user, is doing it by hand.
- **Low-risk**: the `low-risk` label, set at triage against the rule in `docs/agents/triage-labels.md`.
- **Branch**: issue `<n>` builds on `dispatch/<n>`, cut from the default branch.
- **Update the default branch**: `git fetch origin`, then fast-forward the local default branch to
  `origin/<default branch>`. Where a worktree has it checked out (`git worktree list --porcelain`), run
  `git -C <that worktree> merge --ff-only origin/<default branch>` there; with none, run
  `git fetch origin <default branch>:<default branch>`.
- **In progress**: an issue with the `in-progress` label, from launch until its pull request opens. The label is the
  record every machine and the user can see. Its session is `<repo>-t<n>` on the machine that launched it.
- **Capacity**: always check it with `--ci`, since every ticket here opens a ready pull request.
- **Ticket session prompt**, built from these parts, each `<signal …>` being the signal command to `<repo>-dispatch`
  with that message, written out:
  - Always: `/implement #<n>. Work on this branch only. You may push it and open its pull request; merging is for the
    maintainer alone.`
  - For a `low-risk` issue: `This issue is low-risk under docs/agents/triage-labels.md. If the work turns out to need
    a change that rule excludes, stop before committing it, tell the user which change and why, run exactly:
    <signal "#<n> not low-risk: <one-line reason>">, and wait for the user to review the work. Otherwise, once the
    work is committed, do not wait for a review: open the pull request.`
  - For any other issue: `Once the user replies "approved", open the pull request.`
  - Always: `To open the pull request: git fetch origin, rebase onto origin/<default branch>, and if it moved, run the
    verify command AGENTS.md names again. Push the branch, then open a ready pull request into <default branch> as
    AGENTS.md describes, its body holding the review's outcome table and ending "Closes #<n>", with before and after
    screenshots if a user can see the change. Then run exactly: <signal "#<n> opened <pull request URL>">`

## 1. Start

1. Check you are inside the terminal tool; outside it, say so and stop.
2. If list sessions shows a `<repo>-dispatch` agent, another dispatcher already runs this repo's queue: tell the
   user and stop. Otherwise, name yourself `<repo>-dispatch`.
3. `git fetch origin`, and make the checks for before the first session.
4. Find the issues already in progress: `gh issue list --state open --label in-progress --json number,title`. For
   each one:
   - With a `<repo>-t<n>` session here (list sessions), it is still running; leave it.
   - With an open pull request from `dispatch/<n>` (`gh pr list --head dispatch/<n> --state open`), its pull request
     opened while you were away: finish it as step 4 describes.
   - With neither, report it to the user rather than relaunching it: it may be running on another machine.

Done when you are `<repo>-dispatch` and you know every issue in progress.

## 2. Fill the free slots

1. Update the default branch, so each branch starts from every pull request merged so far. If it cannot fast-forward,
   tell the user why and launch nothing.
2. Run the capacity check and read the queue.
3. For each free slot, take the next issue in the queue:
   1. Claim it first: `gh issue edit <n> --add-label in-progress`.
   2. Start its session on branch `dispatch/<n>` from the default branch, with the ticket session prompt. If it fails
      to start, remove the `in-progress` label again and tell the user why.
4. Tell the user, one line per issue, what you launched and whether it is `low-risk`.
5. If the queue still holds issues but no slot is free, run the capacity check with `--wait` as a background task.
   If the queue is empty and nothing is in progress, tell the user the queue is done.

Then end your turn and wait: the ticket sessions' signals, the background capacity check and the user wake you.

## 3. A low-risk issue that isn't

On `#<n> not low-risk: <reason>`:

1. `gh issue edit <n> --remove-label low-risk`.
2. `gh issue comment <n>`: "> *This was generated by AI during dispatch.*", then the reason, then "It now waits for
   the maintainer's review before its pull request opens."
3. Prompt `<repo>-t<n>`: "This issue is no longer low-risk. Once the user replies "approved", open the pull request
   as your first prompt describes."

Tell the user in one line that `#<n>` now waits for their review in its workspace.

## 4. A pull request opened

On `#<n> opened <url>`:

1. Check it: `gh pr list --head dispatch/<n> --state open --json number,url,isDraft,body` shows one ready pull
   request whose body closes `#<n>`. If not, tell the user what you found and wait.
2. `gh issue edit <n> --remove-label in-progress --remove-label ready-for-agent`. The pull request's `Closes #<n>`
   carries the issue from here.
3. Close the ticket's session. worktrunk keeps the branch, which is not merged yet; the pushed copy is what the pull
   request reads.

Tell the user in one line which pull request opened for which issue, then go back to step 2.

## Stopping

When the user says stop, launch nothing more. Sessions in progress carry on; tell the user which ones and that their
issues keep `in-progress` until their pull requests open.
