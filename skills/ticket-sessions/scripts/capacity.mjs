#!/usr/bin/env node
// How many more ticket sessions may start right now. The ticket-sessions skill describes the limits and the two
// config files that hold them.
//
//   node capacity.mjs                       machine and repo limits only
//   node capacity.mjs --ci=main,production  also the CI limit, counting ready pull requests into those branches
//   node capacity.mjs --wait                exit only once a slot is free, re-checking every 5 minutes
//   node capacity.mjs --claim=<repo>-t<n>   take a slot for that session before starting it; exits 2 when none is free
//   node capacity.mjs --release=<repo>-t<n> give back a claim whose session failed to start

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { detect } from "./term.mjs";

const MACHINE_DEFAULTS = { maxAgents: 6, minFreeGiB: 6 };
const REPO_DEFAULTS = { maxAgents: 3, ciCap: 4 };
const RECHECK_MS = 5 * 60 * 1000;
// A claim covers the worktree's setup before its session runs; one older than this belongs to a start that died.
const CLAIM_TTL_MS = 30 * 60 * 1000;
// The lock is held only while one check runs; one older than this was left by a process that died holding it.
const LOCK_STALE_MS = 2 * 60 * 1000;
const TICKET_SESSION = /^.+-t\d+$/;

const CONFIG_HOME = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
const STATE_DIR = join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "ticket-sessions");
const CLAIMS_DIR = join(STATE_DIR, "claims");
const LOCK_DIR = join(STATE_DIR, "claims.lock");

const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(`--${name}=`.length);
const WAIT = args.includes("--wait");
const CLAIM = option("claim");
const RELEASE = option("release");
const ciBranches = option("ci")?.split(",").filter(Boolean);

for (const name of [CLAIM, RELEASE]) {
  if (name !== undefined && !TICKET_SESSION.test(name)) {
    console.error(`${name} is not a ticket session name, <repo>-t<n>`);
    process.exit(1);
  }
}
if (args.includes("--ci") || ciBranches?.length === 0) {
  console.error("--ci needs the branches CI runs on, as --ci=<branch>,<branch>");
  process.exit(1);
}

if (RELEASE) {
  rmSync(join(CLAIMS_DIR, RELEASE), { force: true });
  process.exit(0);
}

const terminal = detect();
if (!terminal) {
  console.error("not inside Herdr, the Herdr app or Rex");
  process.exit(1);
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

function readConfig() {
  const commonDir = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return {
    machine: { ...MACHINE_DEFAULTS, ...readJson(join(CONFIG_HOME, "ticket-sessions", "config.json")) },
    repo: { ...REPO_DEFAULTS, ...readJson(join(commonDir, "orchestrate", "config.json")) },
  };
}

// The live claims, pruning those whose session now runs, and so counts itself, and those past their TTL.
function liveClaims(running) {
  if (!existsSync(CLAIMS_DIR)) return [];
  return readdirSync(CLAIMS_DIR).filter((name) => {
    const path = join(CLAIMS_DIR, name);
    // Another check may prune the same claim between the listing and this read.
    const claimedAt = statSync(path, { throwIfNoEntry: false })?.mtimeMs;
    if (claimedAt === undefined) return false;
    if (running.has(name) || Date.now() - claimedAt > CLAIM_TTL_MS) {
      rmSync(path, { force: true });
      return false;
    }
    return true;
  });
}

// Ticket sessions are named <repo>-t<n>. Every repo's, running or claimed, counts against the machine's limit; this
// repo's against its own. The session being claimed is left out, so claiming it again refreshes its claim.
function ticketSessions(repo) {
  const running = new Set(terminal.list().map(({ name }) => name).filter((name) => TICKET_SESSION.test(name)));
  const all = [...new Set([...running, ...liveClaims(running)])].filter((name) => name !== CLAIM);
  const ofRepo = all.filter((name) => name.startsWith(`${repo}-t`) && /^\d+$/.test(name.slice(repo.length + 2)));
  return { machine: all.length, repo: ofRepo.length };
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

function capacity(repo) {
  const config = readConfig();
  const running = ticketSessions(repo);
  const free = freeGiB();
  let slots = Math.max(0, Math.min(config.machine.maxAgents - running.machine, config.repo.maxAgents - running.repo));
  if (free !== null && free < config.machine.minFreeGiB) slots = 0;

  const report = {
    agents: {
      machine: { running: running.machine, max: config.machine.maxAgents },
      repo: { running: running.repo, max: config.repo.maxAgents },
    },
    memory: free === null ? "unchecked" : { freeGiB: Number(free.toFixed(1)), minFreeGiB: config.machine.minFreeGiB },
  };
  if (ciBranches?.length) {
    const used = ciInUse(ciBranches);
    slots = Math.min(slots, Math.max(0, config.repo.ciCap - used));
    report.ci = { used, cap: config.repo.ciCap };
  }
  return { slots, ...report };
}

// One check-and-claim at a time on this machine, so dispatchers of two repos never take the same slot.
async function withLock(fn) {
  mkdirSync(STATE_DIR, { recursive: true });
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) rmSync(LOCK_DIR, { recursive: true, force: true });
      } catch {}
      await sleep(250);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}

const repo = run("gh", ["repo", "view", "--json", "name", "--jq", ".name"]);

if (CLAIM) {
  const report = await withLock(() => {
    const report = capacity(repo);
    if (report.slots > 0) {
      mkdirSync(CLAIMS_DIR, { recursive: true });
      writeFileSync(join(CLAIMS_DIR, CLAIM), `${process.pid}\n`);
    }
    return { claimed: report.slots > 0, ...report };
  });
  console.log(JSON.stringify(report));
  process.exit(report.claimed ? 0 : 2);
}

let report = capacity(repo);
while (WAIT && report.slots === 0) {
  await sleep(RECHECK_MS);
  report = capacity(repo);
}
console.log(JSON.stringify(report));
