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

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

## Risk: `low-risk`

An issue moved to `ready-for-agent` also gets a risk call, made by the maintainer during triage, never by the agent
that implements it. With `low-risk`, the agent's pull request merges itself once CI and the low-risk check pass.
Without it, the maintainer merges it. Either way, the agent stops for the maintainer only on what its review leaves
to them.

An issue is `low-risk` only when every acceptance criterion in its agent brief can be checked by a test or a command
the agent runs, and the change touches none of these:

- <an area the maintainer must see before it merges>

<The usual `low-risk` work in this repo, such as tests, docs, copy and small UI fixes.>

**Low-risk check**: <a command that fails when a diff touches a path the list above names, run from the default
branch's copy so a change never judges itself; without one, nothing merges itself>.

The call only moves one way during implementation: an agent that finds a `low-risk` issue needs one of the changes
above stops, says which, and the issue loses `low-risk`. Nothing gains `low-risk` except at triage.
