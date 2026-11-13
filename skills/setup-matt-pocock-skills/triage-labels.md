# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Risk: `low-risk`

An issue moved to `ready-for-agent` also gets a risk call, made by the maintainer during triage, never by the agent
that implements it. With `low-risk`, `/dispatch` sends the agent's work straight to a pull request once its checks
and review pass. Without it, the agent stops after review and the maintainer approves the work before a pull request
opens. Neither path merges: merging stays the maintainer's.

An issue is `low-risk` only when every acceptance criterion in its agent brief can be checked by a test or a command
the agent runs, and the change touches none of these:

- <an area the maintainer reviews before any pull request opens>

<The usual `low-risk` work in this repo, such as tests, docs, copy and small UI fixes.>

The call only moves one way during implementation: an agent that finds a `low-risk` issue needs one of the changes
above stops, says which, and the issue loses `low-risk`. Nothing gains `low-risk` except at triage.
