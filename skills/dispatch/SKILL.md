---
name: dispatch
description: "Run triaged ready-for-agent issues in parallel worktrees, each landed by its own session through a pull request into the default branch; low-risk ones merge themselves."
disable-model-invocation: true
---

You are the **dispatcher** for the repo's queue of triaged, standalone issues. Each issue is built, reviewed and
**landed** by its own ticket session, in its own worktree and workspace: the session opens the pull request and owns it
until it merges. A `low-risk` issue's pull request merges itself once CI passes; any other waits for the user to merge
it. A session stops for the user only on what its review leaves to them. You start those sessions within the machine's
and CI's capacity, keep the issues' labels true, and clean up after each pull request merges or closes. You implement,
review and merge nothing.

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
- **Landing**: a session whose pull request is open. It stays until the pull request merges or closes, marked as
  landing so that it stops counting against the agent limits.
- **Capacity**: always check it with `--ci`, since every ticket here opens a ready pull request.
- **Ticket session prompt**, built from these parts, each `<signal …>` being the signal command to `<repo>-dispatch`
  with that message, written out:
  - Always: `/implement #<n>. Work on this branch only. Its pull request goes into <default branch> and closes #<n>.
    When it opens, run exactly: <signal "#<n> opened <pull request URL>">. When it merges, run exactly:
    <signal "#<n> merged <pull request URL>">. When it closes unmerged, run exactly:
    <signal "#<n> closed <pull request URL>">.`
  - For a `low-risk` issue: `This issue is low-risk under docs/agents/triage-labels.md, so its pull request may merge
    itself. If the work turns out to need a change that rule excludes, or the low-risk check fails, tell the user
    which change and why, run exactly: <signal "#<n> not low-risk: <one-line reason>">, and from then on leave the
    merge to the user.`
  - For any other issue: `The user merges its pull request.`

## 1. Start

1. Check you are inside the terminal tool; outside it, say so and stop.
2. If list sessions shows a `<repo>-dispatch` session, another dispatcher already runs this repo's queue: tell the
   user and stop. Otherwise, name yourself `<repo>-dispatch`.
3. `git fetch origin`, and make the checks for before the first session.
4. Find the issues already in progress: `gh issue list --state open --label in-progress --json number,title`. For
   each one:
   - With an open pull request from `dispatch/<n>` (`gh pr list --head dispatch/<n> --state open`), its pull request
     opened while you were away: finish it as step 4 describes.
   - Else with a `<repo>-t<n>` session here (list sessions), it is still running; leave it.
   - With neither, report it to the user rather than relaunching it: it may be running on another machine.
5. Find the sessions landing here whose pull request merged or closed while you were away: for each `<repo>-t<n>`
   session without an in-progress issue, `gh pr list --head dispatch/<n> --state all --json state,url`. Finish a
   merged or closed one as step 5 describes.

Done when you are `<repo>-dispatch` and you know every issue in progress and every session landing.

## 2. Fill the free slots

1. Update the default branch, so each branch starts from every pull request merged so far. If it cannot fast-forward,
   tell the user why and launch nothing.
2. Run the capacity check and read the queue.
3. For each free slot, take the next issue in the queue:
   1. Claim it first: `gh issue edit <n> --add-label in-progress`.
   2. Start its session on branch `dispatch/<n>` from the default branch, with the ticket session prompt. If it fails
      to start, remove the `in-progress` label again. When its slot claim found no free slot, stop filling slots;
      otherwise tell the user why.
4. Tell the user, one line per issue, what you launched and whether it is `low-risk`.
5. If the queue still holds issues but no slot is free, run the capacity check with `--wait` as a background task.
   If the queue is empty and nothing is in progress or landing, tell the user the queue is done.

Then end your turn and wait: the ticket sessions' signals, the background capacity check and the user wake you.

## 3. A low-risk issue that isn't

On `#<n> not low-risk: <reason>`:

1. `gh issue edit <n> --remove-label low-risk`.
2. `gh issue comment <n>`: "> *This was generated by AI during dispatch.*", then the reason, then "Its pull request
   now waits for the maintainer to merge it."

Tell the user in one line that `#<n>` now waits for them to merge it.

## 4. A pull request opened

On `#<n> opened <url>`:

1. Check it: `gh pr list --head dispatch/<n> --state open --json number,url,isDraft,body` shows one ready pull
   request whose body closes `#<n>`. If not, tell the user what you found and wait.
2. `gh issue edit <n> --remove-label in-progress --remove-label ready-for-agent`. The pull request's `Closes #<n>`
   carries the issue from here.
3. If its `<repo>-t<n>` session runs here, mark it landing. With no session, tell the user the pull request has
   nobody landing it: `/land` in its worktree takes it over.

Tell the user in one line which pull request opened for which issue, then go back to step 2: the slot is free.

## 5. A pull request merged or closed

On `#<n> merged <url>` or `#<n> closed <url>`:

1. Check it: `gh pr view <url> --json state` shows `MERGED` or `CLOSED`. If not, tell the user what you found and
   wait.
2. Close the ticket's session.
3. Once merged, `git branch -D dispatch/<n>`: the squash merge leaves the branch looking unmerged to git. A closed
   one keeps its branch, for the user to pick up.

Tell the user in one line, then go back to step 2.

## Stopping

When the user says stop, launch nothing more. Sessions in progress and landing carry on; tell the user which ones,
that their issues keep `in-progress` until their pull requests open, and that landing sessions stay until their pull
requests merge or close.
