#!/usr/bin/env node
// How many more ticket sessions may start right now. The ticket-sessions skill describes the limits and the
// per-machine config file.
//
//   node capacity.mjs                       machine limits only
//   node capacity.mjs --ci=main,production  also the CI limit, counting ready pull requests into those branches
//   node capacity.mjs --wait                exit only once a slot is free, re-checking every 5 minutes

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { detect } from "./term.mjs";

const DEFAULTS = { maxAgents: 3, minFreeGiB: 6, ciCap: 4 };
const RECHECK_MS = 5 * 60 * 1000;

const args = process.argv.slice(2);
const WAIT = args.includes("--wait");
const ciBranches = args
  .find((arg) => arg.startsWith("--ci="))
  ?.slice("--ci=".length)
  .split(",")
  .filter(Boolean);
const terminal = detect();
if (!terminal) {
  console.error("not inside Herdr, the Herdr app or Rex");
  process.exit(1);
}
if (args.includes("--ci") || ciBranches?.length === 0) {
  console.error("--ci needs the branches CI runs on, as --ci=<branch>,<branch>");
  process.exit(1);
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function readConfig() {
  const commonDir = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const path = join(commonDir, "orchestrate", "config.json");
  return { ...DEFAULTS, ...(existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {}) };
}

// Ticket sessions are named <repo>-t<n>; every repo's count against this machine's limit.
function runningTicketSessions() {
  return terminal.list().filter(({ name }) => /-t\d+$/.test(name)).length;
}

// MemAvailable counts reclaimable cache; macOS has no equivalent that a script can read cheaply, so it goes unchecked
// there.
function freeGiB() {
  if (!existsSync("/proc/meminfo")) return null;
  const match = readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+) kB$/m);
  return match ? Number(match[1]) / 1024 / 1024 : null;
}

// A ready pull request runs CI on every push; an in-progress issue will open one. Drafts skip CI.
function ciInUse(branches) {
  const readyPullRequests = JSON.parse(
    run("gh", [
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      "1000",
      "--json",
      "isDraft,baseRefName",
      "--jq",
      `[.[] | select((.isDraft | not) and (.baseRefName | IN(${branches.map((b) => JSON.stringify(b)).join(", ")})))] | length`,
    ]),
  );
  const inProgress = JSON.parse(
    run("gh", ["issue", "list", "--state", "open", "--label", "in-progress", "--json", "number", "--jq", "length"]),
  );
  return readyPullRequests + inProgress;
}

function capacity() {
  const config = readConfig();
  const running = runningTicketSessions();
  const free = freeGiB();
  let slots = Math.max(0, config.maxAgents - running);
  if (free !== null && free < config.minFreeGiB) slots = 0;

  const report = {
    agents: { running, max: config.maxAgents },
    memory: free === null ? "unchecked" : { freeGiB: Number(free.toFixed(1)), minFreeGiB: config.minFreeGiB },
  };
  if (ciBranches?.length) {
    const used = ciInUse(ciBranches);
    slots = Math.min(slots, Math.max(0, config.ciCap - used));
    report.ci = { used, cap: config.ciCap };
  }
  return { slots, ...report };
}

let report = capacity();
while (WAIT && report.slots === 0) {
  await sleep(RECHECK_MS);
  report = capacity();
}
console.log(JSON.stringify(report));
