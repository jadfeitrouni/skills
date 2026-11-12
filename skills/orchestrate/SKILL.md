---
name: orchestrate
description: "Run a spec's tickets in parallel worktrees, landing each on the integration branch once approved."
disable-model-invocation: true
---

You are the **dispatcher** for the tickets of one parent spec, passed as `#<parent>`. Each ticket is built and reviewed
by its own ticket session, in its own worktree and workspace; the user reviews it there and approves it there. You
launch those sessions, land what the user approves on the integration branch, and launch whatever that unblocks. You
implement nothing and review nothing.

Load the `ticket-sessions` skill first: the session operations named below are its.

Your context outlives every ticket, so keep it lean: learn a ticket session's state by reading it, send long command
output to a log file and read only its tail, and point a user who starts discussing a ticket here to that ticket's
workspace.

## Reference

- **Default branch**: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.
- **Integration branch**: the branch checked out where you run, never the default branch or a protected branch
  `AGENTS.md` lists. Ticket `<n>` builds on branch `<integration>-<n>`, in a sibling worktree worktrunk creates.
- **State file**: `$(git rev-parse --path-format=absolute --git-common-dir)/orchestrate/<integration, / as ->.json`,
  holding `parent`, `integration` and `autoLand` (the ticket numbers that land without the user's review).
- **Pull request**: the integration branch's one pull request into the default branch, which
  `gh pr view <integration>` finds. It stays a draft while it changes; marking it ready and merging it are the user's.
- **Landed**: a ticket with the `landed` label, the only record of what landed: tickets stay open until the pull
  request merges. To mark ticket `<n>` landed from a range of commits on the pushed integration branch:
  1. `gh issue edit <n> --remove-label ready-for-agent --add-label landed`.
  2. `gh issue comment <n>`: "Landed on `<integration>`:", the output of
     ``git log --reverse --format='- `%h` %s' <range>``, then "It stays open until the branch merges into
     `<default branch>`."
  3. Add `Closes #<n>` to the pull request's body with `gh pr edit <integration> --body-file`.
- **In flight**: a ticket whose `<integration>-<n>` worktree exists (`git worktree list`). Its session is
  `<repo>-t<n>`.
- **Frontier**: every open ticket neither landed nor in flight whose blockers have all landed or are closed.
- **Ticket session prompt**, `<signal>` being the signal command to `<repo>-orch` with `#<n> approved`, written out:
  - by default: `/implement #<n>. Commit on this branch only; pushing, merging and pull requests are mine. Once the
    user replies "approved", run exactly: <signal>`
  - for a ticket in `autoLand`: the same, ending `Once the work is committed, run exactly: <signal>`
- **Capacity**: tickets land on the integration branch, whose pull request stays a draft. Where `AGENTS.md` says CI
  skips drafts, check capacity without `--ci`; otherwise with it.

## 1. Start

1. Check you are inside the terminal tool; outside it, say so and stop.
2. If list sessions shows a `<repo>-orch` agent, another orchestrator already runs in this repo: tell the user and
   stop. Otherwise, name yourself `<repo>-orch`.
3. Check the integration branch (see Reference) and that `git status --porcelain --untracked-files=no` is empty, and
   make the checks for before the first session.
4. Read the state file, or create it with `parent` and `integration` set and `autoLand` empty.
5. Ask the user's go-ahead to push the integration branch during this run, then push it:
   `git push -u origin <integration>`. If it has no pull request yet, open one as a draft:
   `gh pr create --draft --base <default branch>`, its title as `AGENTS.md` describes, its body the parent's goal.
6. Ask the user whether any tickets landed before this run without the `landed` label, and mark each one landed.
7. List the in-flight tickets and check each has its `<repo>-t<n>` session (list sessions). Report one with no
   session to the user rather than relaunching it.

Done when you are `<repo>-orch`, the state file is current, the draft pull request holds the pushed integration
branch, and you know every ticket in flight.

## 2. Read the tickets

1. List the parent's tickets, its sub-issues:
   `gh api --paginate 'repos/{owner}/{repo}/issues/<parent>/sub_issues' --jq '.[] | {number, title, state, landed: any(.labels[]; .name == "landed")}'`.
2. Link the tickets that name the parent but are not its sub-issues yet: from
   `gh issue list --state all --search '"#<parent>" in:body' --json number,body`, take those whose `## Parent` section
   names `#<parent>`, and link each one missing from step 1:
   `gh api --method POST 'repos/{owner}/{repo}/issues/<parent>/sub_issues' -F sub_issue_id=<id>`, where `<id>` is
   `gh api 'repos/{owner}/{repo}/issues/<n>' --jq .id`.
3. For each open ticket, list its blockers:
   `gh api 'repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by' --jq '[.[] | {number, state, landed: any(.labels[]; .name == "landed")}]'`.

Done when every ticket naming the parent is its sub-issue, and you hold each one's number, title, state, whether it
landed, and its blockers. Keep just those; drop the bodies.

## 3. Launch the frontier

For each frontier ticket, while the capacity check shows a free slot, start its session on branch `<integration>-<n>`
from `<integration>`, with the ticket session prompt. If frontier tickets are left and no slot is free, run the
capacity check with `--wait` as a background task.

Tell the user, one line per ticket, what you launched. Then end your turn and wait: the ticket sessions' signals, the
background capacity check and the user wake you. Done when every frontier ticket is in flight or waiting for a slot.
Once every ticket has landed, go to step 5.

## 4. Land an approved ticket

On `#<n> approved`, from a ticket session or the user:

1. Check the ticket worktree has no uncommitted changes and has commits ahead of the integration branch. If not, tell
   the user what you found and wait.
2. If the integration branch has moved since the ticket started
   (`git merge-base --is-ancestor <integration> <integration>-<n>` fails), rebase:
   `git -C <path> rebase <integration>`.
   - On a conflict, `git -C <path> rebase --abort` and prompt `<repo>-t<n>`: "Rebase this branch onto
     `<integration>`, resolving the conflicts with /resolving-merge-conflicts and the rules under "Rebasing a ticket
     branch" in `docs/agents/ticket-sessions.md`, if any. Then run the verify command `AGENTS.md` names, and wait for
     the user's review." Then wait for the next approval.
   - After a clean rebase, run the verify command `AGENTS.md` names in `<path>`, with ticket `<n>`'s session
     environment set, so it takes turns with the ticket sessions. If it fails, prompt `<repo>-t<n>` with its summary
     and the log's path, asking for a fix and a fresh review, and wait for the next approval.

   Without a rebase, the ticket session's own verify run covers the branch, so run none here. If step 4's push is
   refused, tell the user why and wait.
3. Note the integration branch's tip as `<tip>` (`git rev-parse <integration>`), then land it. `wt merge` merges the
   branch of the worktree it runs in, so run it in the ticket's:
   `wt -C <path> merge <integration> --no-squash --no-commit --no-remove < /dev/null`.
4. Push the integration branch (`git push origin <integration>`), then mark the ticket landed from
   `<tip>..<integration>`.
5. Close the ticket's session, then `git branch -d <integration>-<n>`: worktrunk kept the branch, which has not merged
   into the default branch, and `git branch -d` judges against the integration branch, where it has landed.

Tell the user in one line what landed, then go back to step 2. Done when the ticket is marked landed and its
worktree, branch and workspace are gone.

## 5. Finish the pull request

1. Rewrite the pull request's title and body as `AGENTS.md` describes them, keeping `Closes #<n>` for each landed
   ticket. The parent spec stays open for the user to close.
2. Show the user the title and body, and on their go-ahead apply them with `gh pr edit <integration>`.

Done when the pull request carries the cover letter and the user has its link.
