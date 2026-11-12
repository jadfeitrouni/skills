---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets, in these steps:

1. Record the starting commit: `git rev-parse HEAD`.
2. Build the work, using /tdd where possible at pre-agreed seams. Run typechecking and single test files regularly.
   - Build the simplest thing that could possibly work: every new module, type or layer passes the deletion test in
     `/codebase-design`.
   - Follow the campsite rule: leave every file you touch better than you found it. Call logic that already exists
     rather than copying it, and clear the file's lint warnings, whether or not the ticket caused them. A cleanup that
     restructures code deletes more than it adds. The ticket bounds what the code does, not how the code you touch is
     built, so cleanup stays inside the files the change touches; one reaching further, across many files or a shared
     interface, goes in your report as a follow-up issue for the user to file.
3. Review the work while it is still uncommitted: run /review-changes with the starting commit as the fixed point and
   the issue or spec as the spec source.
4. Act on the findings as `/review-changes` describes under "Act on the findings".
5. Run the verify command `AGENTS.md` names, as it describes, until it passes.
6. Commit the verified files, unchanged, to the current branch. Split them into commits by logical change, the
   campsite cleanup in its own, but don't verify each commit: branches are squash-merged, so only the final tree must
   pass, and step 5 checked it.
7. Report the commits, the review's outcome table and any follow-up issues, then wait for the user's review. When the
   user picks proposed fixes, make them, run steps 5 and 6 again, and report the table with those rows updated.
