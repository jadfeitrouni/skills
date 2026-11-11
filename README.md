# skills

Agent skills shared across my repos. Install them into a repo with:

```sh
npx skills add jadfeitrouni/skills
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
| `grilling` | model | The interview primitive behind `grill-me` and `triage` |
| `domain-modeling` | model | Keep `CONTEXT.md` and ADRs current |
| `codebase-design` | model | Deep-module vocabulary, used by `tdd` |
| `tdd` | model | Red-green-refactor at agreed seams |
| `review-changes` | model | Two-axis review of a diff: Standards and Spec |
| `resolving-merge-conflicts` | model | Resolve a merge or rebase conflict by intent |
| `ticket-sessions` | model | Capacity, start, signal and close for `orchestrate` and `dispatch` sessions |
| `prototype` | model | Build a throwaway prototype to settle a state-model or UI question |
| `diagnosing-bugs` | model | Diagnose a hard bug or regression from a red feedback loop |
| `writing-for-agents` | model | Write skills, `AGENTS.md` and docs agents read |
| `setup-matt-pocock-skills` | user | Write a repo's `docs/agents/` issue tracker, triage labels and domain docs |

## What a repo supplies

- `AGENTS.md` names the **verify command** that must pass before work counts as done, the **protected branches**, and
  which branches CI runs on and whether it skips drafts.
- `docs/agents/issue-tracker.md`, `triage-labels.md` and `domain.md`: run `/setup-matt-pocock-skills` to write them.
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

Most of these skills began as [mattpocock/skills](https://github.com/mattpocock/skills), under its MIT license.
`orchestrate`, `dispatch`, `implement`, `review-changes` and `ticket-sessions` are my own or rewritten.
