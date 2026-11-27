#!/usr/bin/env node
// The land skill's helpers.
//
//   node land.mjs watch <pr> [--self-merge]   wait for the pull request's next event, print it as one JSON line
//   node land.mjs lock                         take the repo's merge lock, waiting while another session holds it
//   node land.mjs unlock                       give the merge lock back

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const POLL_MS = 60 * 1000;
// A pull request that no workflow checks has nothing to wait for once its head has sat this long.
const NO_CHECKS_GRACE_MS = 5 * 60 * 1000;
const MAX_ERRORS = 10;
// The lock spans one merge: a fetch, maybe a local verify, the merge. One older than this was left by a dead session.
const LOCK_STALE_MS = 60 * 60 * 1000;

const [command, ...args] = process.argv.slice(2);

function run(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function done(event) {
  console.log(JSON.stringify(event));
  process.exit(0);
}

function readCheck(item) {
  if (item.__typename === "StatusContext") {
    const finished = !["PENDING", "EXPECTED"].includes(item.state);
    return { name: item.context, finished, passed: item.state === "SUCCESS", url: item.targetUrl };
  }
  const finished = item.status === "COMPLETED";
  const passed = ["SUCCESS", "SKIPPED", "NEUTRAL"].includes(item.conclusion);
  return { name: `${item.workflowName ?? ""} / ${item.name}`, finished, passed, url: item.detailsUrl };
}

async function watch() {
  const pr = args.find((arg) => !arg.startsWith("--"));
  const selfMerge = args.includes("--self-merge");
  if (!pr) {
    console.error("usage: land.mjs watch <pr> [--self-merge]");
    process.exit(1);
  }

  let errors = 0;
  let head;
  let headSince = Date.now();
  for (;;) {
    let view;
    try {
      view = JSON.parse(
        run("gh", ["pr", "view", pr, "--json", "state,mergeable,headRefOid,statusCheckRollup,url"]),
      );
      errors = 0;
    } catch (error) {
      if (++errors >= MAX_ERRORS) done({ event: "error", detail: String(error.stderr || error.message).trim() });
      await sleep(POLL_MS);
      continue;
    }

    if (view.headRefOid !== head) {
      head = view.headRefOid;
      headSince = Date.now();
    }
    const base = { pr: Number(pr), url: view.url, head };
    if (view.state === "MERGED") done({ event: "merged", ...base });
    if (view.state === "CLOSED") done({ event: "closed", ...base });
    if (view.mergeable === "CONFLICTING") done({ event: "conflict", ...base });

    const checks = (view.statusCheckRollup ?? []).map(readCheck);
    const failed = checks.filter((check) => check.finished && !check.passed);
    if (failed.length) done({ event: "failing", ...base, failed });

    if (selfMerge && view.mergeable === "MERGEABLE") {
      const allPassed = checks.length > 0 && checks.every((check) => check.finished && check.passed);
      const nothingToWaitFor = checks.length === 0 && Date.now() - headSince > NO_CHECKS_GRACE_MS;
      if (allPassed || nothingToWaitFor) done({ event: "ready", ...base });
    }
    await sleep(POLL_MS);
  }
}

function lockPath() {
  return join(run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]), "land.lock");
}

async function lock() {
  const path = lockPath();
  let told = false;
  for (;;) {
    try {
      mkdirSync(path);
      writeFileSync(join(path, "holder"), `${process.cwd()} since ${new Date().toISOString()}\n`);
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const takenAt = statSync(path, { throwIfNoEntry: false })?.mtimeMs;
      if (takenAt !== undefined && Date.now() - takenAt > LOCK_STALE_MS) {
        rmSync(path, { recursive: true, force: true });
        continue;
      }
      if (!told) {
        console.error(`land: waiting for the merge lock at ${path}`);
        told = true;
      }
      await sleep(5000);
    }
  }
}

if (command === "watch") await watch();
else if (command === "lock") await lock();
else if (command === "unlock") rmSync(lockPath(), { recursive: true, force: true });
else {
  console.error("usage: land.mjs watch <pr> [--self-merge] | lock | unlock");
  process.exit(1);
}
