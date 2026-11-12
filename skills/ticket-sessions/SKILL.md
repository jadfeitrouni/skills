---
name: ticket-sessions
description: Ticket sessions, the parallel Claude sessions /orchestrate and /dispatch run, one per ticket in its own worktree and Herdr workspace. Use to check capacity for one, or to start, read, prompt or close one.
user-invocable: false
---

`/orchestrate` and `/dispatch` each hand a ticket to its own Claude session, a **ticket session**. This skill is the
part they share and the only one that names the terminal tool, Herdr: how much a machine can run at once, how a session
starts and closes, and how sessions signal each other. The repo's part, what a new worktree and a session's checks
need, is in `docs/agents/ticket-sessions.md`; a section that file lacks needs nothing.

## Operations

- **Inside the terminal tool**: `HERDR_ENV` is `1`.
- **Repo name** `<repo>`: `gh repo view --json name --jq .name`. Every session name starts with it, since sessions
  from several repos share one Herdr.
- **Name yourself `<name>`**: `herdr agent rename "$HERDR_PANE_ID" <name>`. Herdr drops the name when the process
  exits, so name yourself on every start.
- **List sessions**: `herdr agent list`. Ticket `<n>`'s session is the agent `<repo>-t<n>`.
- **Read a session's state**: `herdr agent get <repo>-t<n>`.
- **Signal command** to agent `<to>` with `<message>`: `herdr agent prompt <to> "<message>"`. A ticket session's
  prompt carries it written out in full, since the session never loads this skill.
- **Prompt a session**: the signal command with `<repo>-t<n>` as `<to>`.

## Capacity

Every ticket session builds, typechecks and tests on the machine it runs on, and a ready pull request runs CI on every
push. Before starting a session, run `node <this skill's directory>/scripts/capacity.mjs`. When the session's work will
open a ready pull request, add `--ci=<branches>`: the comma-separated branches `AGENTS.md` says CI runs on. The script
prints one JSON line, and a session may start only while its `slots` is above 0. It counts these limits:

- **Agents**: ticket sessions running on this machine stay under `maxAgents`.
- **Memory**: free memory (`MemAvailable`) stays at or above `minFreeGiB`. macOS goes unchecked; there the agent limit
  is the only machine limit.
- **CI**, with `--ci`: ready pull requests into those branches, anyone's, plus issues labelled `in-progress`, stay
  under `ciCap`. The count lives on GitHub, so it holds across machines and includes the maintainer's own pull requests.

When work is waiting and `slots` is 0, run the same command with `--wait`, as a background task. It exits once a slot
frees up, re-checking every 5 minutes, and its exit wakes you.

The limits come from `<git common dir>/orchestrate/config.json` on each machine, so a laptop and a server can hold
different values. A missing file or key falls back to `{ "maxAgents": 3, "minFreeGiB": 6, "ciCap": 4 }`.

## Before the first session

Make each check `docs/agents/ticket-sessions.md` lists under "Before starting sessions". If one fails, stop and tell
the user what to fix.

## Starting a session

To start ticket `<n>` on branch `<branch>`, cut from `<base>`, with prompt `<prompt>`:

1. `wt switch --create <branch> --base <base> --no-cd < /dev/null`. On "needs approval", stop starting sessions and
   ask the user to run `! wt config approvals add`, then resume.
2. Find the worktree's path in `git worktree list --porcelain`, then wait until it is ready as "Worktree ready" in
   `docs/agents/ticket-sessions.md` describes.
3. `herdr workspace create --cwd <path> --label "<repo> #<n>" --no-focus`, with one `--env <NAME>=<value>` for each
   variable under "Session environment" in `docs/agents/ticket-sessions.md`. The pane is `.result.root_pane.pane_id`.
4. `herdr agent start <repo>-t<n> --kind claude --pane <pane>`, then prompt the session with `<prompt>`.

## Closing a session

The session is still running inside its worktree, so in this order: `herdr workspace close` the session's workspace
(reading its state names it), then `wt remove <branch> < /dev/null`. worktrunk judges merges against the default
branch, so it keeps a branch not merged there.
