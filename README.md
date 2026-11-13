# skills

Agent skills shared across my repos and harnesses. Each machine runs one checkout of this repo, linked into every
harness's user-level skills folder, so a pushed change reaches every repo and worktree without touching them.

## Install

```sh
git clone https://github.com/jadfeitrouni/skills ~/repos/skills
~/repos/skills/install.sh
```

`install.sh` links each skill into `~/.claude/skills` (Claude Code, OpenCode) and `~/.agents/skills` (OpenCode,
Codex). Edits to the checkout are live at once. It leaves alone anything there it did not link, and removes its links
to skills that no longer exist. `SKILLS_HOME` moves the checkout.

To pick up pushed changes, run `install.sh --pull` on a schedule. It skips the pull when the checkout has local
changes or the network fails:

```sh
*/10 * * * * $HOME/repos/skills/install.sh --pull >/dev/null 2>&1
```

A cloud session starts from nothing, so a repo that runs Claude Code on the web installs the skills from a
SessionStart hook in its committed `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "[ \"$CLAUDE_CODE_REMOTE\" = true ] || exit 0; [ -d ~/repos/skills ] || git clone -q https://github.com/jadfeitrouni/skills ~/repos/skills; sh ~/repos/skills/install.sh || true"
          }
        ]
      }
    ]
  }
}
```

The skills hold no repo specifics. Each repo supplies those through its own `AGENTS.md` and `docs/agents/`.

## Skills

| Skill | Invoked by | What it does |
| --- | --- | --- |
| `grill-me` | user | A relentless interview to sharpen a plan or design |
| `to-spec` | user | Turn the conversation into a spec on the issue tracker |
| `to-tickets` | user | Split a spec into tracer-bullet tickets with blocking edges |
| `triage` | user | Move incoming issues through the triage roles to agent-ready briefs |
| `implement` | user | Build a ticket test-first, review it, verify, commit |
| `orchestrate` | user | Run a spec's tickets in parallel sessions and land them on an integration branch |
| `dispatch` | user | Run triaged standalone issues in parallel sessions, each to its own pull request |
| `improve-codebase-architecture` | user | Find deepening opportunities, report them visually, grill the one you pick |
| `retro` | user | Review a session for improvements to the agent's environment |
| `grilling` | model | The interview primitive behind `grill-me`, `triage` and `improve-codebase-architecture` |
| `domain-modeling` | model | Keep `GLOSSARY.md` and ADRs current |
| `codebase-design` | model | Deep-module vocabulary, used by `tdd` |
| `tdd` | model | Red-green-refactor at agreed seams |
| `review-changes` | model | Two-axis review of a diff: Standards and Spec |
| `pr` | model | Pull request body: summary visual, evidence, merge danger |
| `resolving-merge-conflicts` | model | Resolve a merge or rebase conflict by intent |
| `ticket-sessions` | model | Capacity, start, signal and close for `orchestrate` and `dispatch` sessions |
| `prototype` | model | Build a throwaway prototype to settle a state-model or UI question |
| `diagnosing-bugs` | model | Diagnose a hard bug or regression from a red feedback loop |
| `writing-for-agents` | model | Write skills, `AGENTS.md` and docs agents read |
| `setup-skills` | user | Write a repo's `docs/agents/` issue tracker, triage labels, low-risk rule and domain docs |

## What a repo supplies

- `AGENTS.md` names the **verify command** that must pass before work counts as done, the **protected branches**, and
  which branches CI runs on and whether it skips drafts.
- `docs/agents/issue-tracker.md`, `triage-labels.md` and `domain.md`: run `/setup-skills` to write them.
  For `dispatch`, `triage-labels.md` also holds the **low-risk rule**: what an issue's change must not touch for its
  pull request to open without the maintainer's review. Without it, every issue waits for that review.
- `docs/agents/ticket-sessions.md`, for `orchestrate` and `dispatch` only. Each section is optional:
  - **Before starting sessions**: checks the dispatcher makes before launching anything.
  - **Worktree ready**: what to wait for after worktrunk creates a worktree.
  - **Session environment**: variables set in each session's workspace, as `NAME=<value>`.
  - **Rebasing a ticket branch**: repo rules for resolving a rebase conflict, such as regenerating migrations.

## Tools

`orchestrate` and `dispatch` run each ticket in its own [worktrunk](https://worktrunk.dev) worktree and Herdr
workspace, and talk to GitHub through `gh`. Only `ticket-sessions` and its `scripts/capacity.mjs` name Herdr, so
another terminal tool replaces those two files and nothing else.

## Credits

Most of these skills are Matt Pocock's, from [mattpocock/skills](https://github.com/mattpocock/skills), used under
its MIT license. They were last synced with his repo at `5863806` (12 November 2026), so they may lag it.

| Skill | From mattpocock/skills | Here |
| --- | --- | --- |
| `grill-me` | `skills/productivity/grill-me` | unchanged |
| `grilling` | `skills/productivity/grilling` | unchanged |
| `writing-for-agents` | `skills/productivity/writing-for-agents` | unchanged |
| `to-spec` | `skills/engineering/to-spec` | points at `setup-skills` |
| `to-tickets` | `skills/engineering/to-tickets` | points at `setup-skills` |
| `triage` | `skills/engineering/triage` | makes the low-risk call |
| `tdd` | `skills/engineering/tdd` | points at `review-changes` |
| `domain-modeling` | `skills/engineering/domain-modeling` | unchanged |
| `codebase-design` | `skills/engineering/codebase-design` | unchanged |
| `prototype` | `skills/engineering/prototype` | unchanged |
| `diagnosing-bugs` | `skills/engineering/diagnosing-bugs` | unchanged |
| `improve-codebase-architecture` | `skills/engineering/improve-codebase-architecture` | unchanged |
| `pr` | `skills/engineering/pr`, itself from Dex Horthy's `show-me` | unchanged |
| `retro` | `skills/engineering/retro` | unchanged |
| `setup-skills` | `skills/engineering/setup-matt-pocock-skills` | renamed; writes the low-risk rule; no `/wayfinder` operations |
| `resolving-merge-conflicts` | `skills/engineering/resolving-merge-conflicts`, since removed upstream | unchanged |
| `review-changes` | `skills/engineering/code-review` | renamed; reviews uncommitted work too; hard checks, finding kinds and an outcome table |
| `implement` | `skills/engineering/implement` | campsite rule; reviews before committing and acts on the findings by kind; verifies as `AGENTS.md` says |

`orchestrate`, `dispatch` and `ticket-sessions` are mine.
