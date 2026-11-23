---
name: ticket-sessions
description: Ticket sessions, the parallel agent sessions /orchestrate and /dispatch run, one per ticket in its own worktree and terminal workspace. Use to check capacity for one, or to start, read, prompt or close one.
user-invocable: false
---

`/orchestrate` and `/dispatch` each hand a ticket to its own agent session, a **ticket session**. This skill is the
part they share: how much a machine can run at once, how a session starts and closes, and how sessions signal each
other. The repo's part, what a new worktree and a session's checks need, is in `docs/agents/ticket-sessions.md`; a
section that file lacks needs nothing.

## Operations

Every operation runs `node <this skill's directory>/scripts/term.mjs`, written `term` below. It drives the **terminal
tool** this session runs inside: Herdr, the Herdr app or Rex. A session it starts runs in the same tool.

- **Inside the terminal tool**: `term inside` succeeds and names the tool.
- **Repo name** `<repo>`: `gh repo view --json name --jq .name`. Every session name starts with it, since sessions
  from several repos share one terminal tool.
- **Name yourself `<name>`**: `term name <name>`. Some tools drop the name when the agent exits, so name yourself on
  every start.
- **List sessions**: `term list`, each running ticket session with its name and state. Ticket `<n>`'s session is `<repo>-t<n>`.
- **Read a session's state**: `term state <repo>-t<n>`: `working`, `blocked`, `idle`, `done` or `unknown`.
- **Signal command** to session `<to>` with `<message>`: `node <absolute path of term.mjs> send <to> "<message>"`. A
  ticket session's prompt carries it written out in full, since the session never loads this skill.
- **Prompt a session**: the signal command with `<repo>-t<n>` as `<to>`.

## Capacity

Every ticket session builds, typechecks and tests on the machine it runs on, and a ready pull request runs CI on every
push. Before starting a session, run `node <this skill's directory>/scripts/capacity.mjs`. When the session's work will
open a ready pull request, add `--ci=<branches>`: the comma-separated branches `AGENTS.md` says CI runs on. The script
prints one JSON line, and a session may start only while its `slots` is above 0. It counts these limits:

- **Agents**: ticket sessions on this machine, every repo's, stay under the machine's `maxAgents`, and this repo's stay
  under the repo's `maxAgents`, so one repo's queue leaves slots for the others. A session counts from its claim.
- **Memory**: free memory (`MemAvailable`) stays at or above `minFreeGiB`. macOS goes unchecked; there the agent limit
  is the only machine limit.
- **CI**, with `--ci`: ready pull requests into those branches, anyone's, plus issues labelled `in-progress`, stay
  under `ciCap`. The count lives on GitHub, so it holds across machines and includes the maintainer's own pull requests.

When work is waiting and `slots` is 0, run the same command with `--wait`, as a background task. It exits once a slot
frees up, re-checking every 5 minutes, and its exit wakes you.

Two files on each machine hold the limits, so a laptop and a server can hold different values. A missing file or key
falls back to the default shown:

- **Machine**: `${XDG_CONFIG_HOME:-~/.config}/ticket-sessions/config.json`, `{ "maxAgents": 6, "minFreeGiB": 6 }`.
- **Repo**: `<git common dir>/orchestrate/config.json`, `{ "maxAgents": 3, "ciCap": 4 }`.

## Before the first session

`mkdir -p <git common dir>/orchestrate`, where the verify lock lives. Then make each check
`docs/agents/ticket-sessions.md` lists under "Before starting sessions". If one fails, stop and tell the user what to
fix.

## Session environment

Ticket `<n>`'s session environment, which its session and every check run for it get:

- `VERIFY_LOCK=<git common dir>/orchestrate/verify.lock`. A verify command that is heavy takes this file as an
  exclusive lock, so the sessions on one machine verify one at a time. A light one ignores it.
- Each variable under "Session environment" in `docs/agents/ticket-sessions.md`, for ticket `<n>`.

## Starting a session

To start ticket `<n>` on branch `<branch>`, cut from `<base>`, with prompt `<prompt>`:

1. Claim its slot: `node <this skill's directory>/scripts/capacity.mjs --claim=<repo>-t<n>`, with the `--ci` your
   capacity check takes. It claims only while `slots` is above 0, one dispatcher at a time across the machine, so two
   repos' dispatchers never take the same slot. Exit 2 means no slot was free: start nothing, as if the capacity check
   had shown 0. The claim holds the slot until the session runs, for up to 30 minutes. If a later step fails, give it
   back: `node <this skill's directory>/scripts/capacity.mjs --release=<repo>-t<n>`.
2. `wt switch --create <branch> --base <base> --no-cd < /dev/null`. On "needs approval", stop starting sessions and
   ask the user to run `! wt config approvals add`, then resume.
3. Find the worktree's path in `git worktree list --porcelain`, then wait until it is ready as "Worktree ready" in
   `docs/agents/ticket-sessions.md` describes.
4. `term start <repo>-t<n> --cwd <path> --label "<repo> #<n>" -- "<prompt>"`, with one `--env <NAME>=<value>` before
   the `--` for each variable of ticket `<n>`'s session environment. It starts the dispatcher's agent (Claude Code,
   OpenCode or Antigravity) in a new workspace that doesn't take focus, names the session and gives it `<prompt>`. An
   OpenCode session is created with the dispatcher's model; Claude Code and Antigravity sessions run under their
   configured model.

## Closing a session

The session is still running inside its worktree, so in this order: `term close <repo>-t<n>`, which closes its
workspace too, then `wt remove <branch> < /dev/null`. worktrunk judges merges against the default
branch, so it keeps a branch not merged there.
