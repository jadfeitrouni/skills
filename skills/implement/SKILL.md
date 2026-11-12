---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets, in these steps:

1. Record the starting commit: `git rev-parse HEAD`.
2. Build the work, using /tdd where possible at pre-agreed seams. Run typechecking and single test files regularly.
3. Review the work while it is still uncommitted: run /review-changes with the starting commit as the fixed point and
   the issue or spec as the spec source.
4. Fix every finding.
5. Run the verify command `AGENTS.md` names, as it describes, until it passes.
6. Commit the verified files, unchanged, to the current branch. Split them into commits by logical change, but don't
   verify each commit: branches are squash-merged, so only the final tree must pass, and step 5 checked it.
7. Report the commits and each review finding with what you did about it, then wait for the user's review.
