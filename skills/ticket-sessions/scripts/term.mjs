#!/usr/bin/env node
// The terminal tool behind ticket sessions: Herdr (the TUI), herdr-core (the Herdr app's runtime, `hc`) or Rex. Every
// operation the ticket-sessions skill names goes through here, so the skill and its callers never name a tool. The tool
// is the one this process runs inside, so a dispatcher and the ticket sessions it starts always share one.
//
//   term.mjs inside                       which tool this runs in; exits 1 outside all of them
//   term.mjs name <name>                  name the session this runs in, so others can address it
//   term.mjs list                         every named session, with its state, as JSON
//   term.mjs state <name>                 one session's state: working, blocked, idle, done or unknown
//   term.mjs send <name> <text>           type text into a session and submit it
//   term.mjs start <name> --cwd <path> --label <label> [--env NAME=value]... -- <prompt>
//                                         start the dispatcher's agent in a new workspace, unfocused, named <name>, with <prompt>
//   term.mjs close <name>                 close a session and the workspace start made for it

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function json(command, args) {
  return JSON.parse(run(command, args));
}

const STATES = new Set(["working", "blocked", "idle", "done"]);
const normalState = (state) => (STATES.has(state) ? state : "unknown");

// A ticket session runs the same agent as its dispatcher: Claude Code and Antigravity open with a slash command,
// OpenCode mentions the skill id with `@`. AI_AGENT wins when tools' variables are inherited; Antigravity sets
// ANTIGRAVITY_AGENT=1 and OpenCode sets OPENCODE=1.
const AI_AGENT = process.env.AI_AGENT;
const AGENT =
  AI_AGENT === "opencode" ? "opencode"
  : AI_AGENT === "claude" ? "claude"
  : AI_AGENT === "agy" || AI_AGENT === "antigravity" ? "agy"
  : process.env.ANTIGRAVITY_AGENT === "1" ? "agy"
  : process.env.OPENCODE === "1" ? "opencode"
  : "claude";
const SESSION_AGENTS = new Set(["claude", "opencode", "agy"]);
const SKILLS = /\/(implement|review-changes|resolving-merge-conflicts|tdd|codebase-design)\b/g;

const sessionPrompt = (prompt) => (AGENT === "opencode" ? prompt.replace(SKILLS, "@$1") : prompt);

// A ticket session must run the dispatcher's model, not whichever one OpenCode last used. Pre-create its session
// with that model at the ticket worktree, then open it by id; if the lookup fails, start without one.
function opencodeSession(cwd) {
  const current = process.env.OPENCODE_SESSION_ID;
  if (!current) return null;
  try {
    const { data } = JSON.parse(run("opencode", ["api", "GET", `/api/session/${current}`]));
    const created = JSON.parse(
      run("opencode", [
        "api", "session.create", "--data",
        JSON.stringify({ model: data.model, location: { directory: cwd } }),
      ]),
    );
    return created.data.id;
  } catch {
    return null;
  }
}

// Session variables from the dispatcher's own conversation that a fresh child agent must not inherit.
const UNSET_ENV = {
  opencode: ["OPENCODE_SESSION_ID"],
  agy: [
    "ANTIGRAVITY_AGENT",
    "ANTIGRAVITY_CONVERSATION_ID",
    "ANTIGRAVITY_TRAJECTORY_ID",
    "ANTIGRAVITY_SOURCE_METADATA",
    "ANTIGRAVITY_LS_ADDRESS",
    "ANTIGRAVITY_CSRF_TOKEN",
  ],
};

// The command each tool runs in a new workspace, with its first prompt and the environment in front, since neither
// Rex nor hc takes environment variables for a new terminal. A fresh session must not inherit the dispatcher's
// session variables, or it could attach to this conversation instead of starting its own.
const agentCommand = (env, prompt, cwd) => {
  const session = AGENT === "opencode" ? opencodeSession(cwd) : null;
  const command =
    AGENT === "opencode"
      ? ["opencode", ...(session ? ["--session", session] : []), "--prompt", sessionPrompt(prompt)]
      : AGENT === "agy"
        ? ["agy", "--prompt-interactive", sessionPrompt(prompt)]
        : ["claude", sessionPrompt(prompt)];
  const unset = (UNSET_ENV[AGENT] ?? []).flatMap((name) => ["-u", name]);
  return ["env", ...unset, ...env, ...command];
};

const herdr = {
  tool: "herdr",
  name(name) {
    run("herdr", ["agent", "rename", process.env.HERDR_PANE_ID, name]);
  },
  list() {
    const { agents } = json("herdr", ["agent", "list"]).result;
    return agents.filter((a) => a.name).map((a) => ({ name: a.name, state: normalState(a.agent_status) }));
  },
  agent(name) {
    return json("herdr", ["agent", "get", name]).result.agent;
  },
  state(name) {
    return normalState(this.agent(name).agent_status);
  },
  send(name, text) {
    run("herdr", ["agent", "prompt", name, text]);
  },
  start(name, { cwd, label, env, prompt }) {
    const session = AGENT === "opencode" ? opencodeSession(cwd) : null;
    const created = json("herdr", [
      "workspace", "create", "--cwd", cwd, "--label", label, "--no-focus",
      ...env.flatMap((pair) => ["--env", pair]),
    ]);
    run("herdr", [
      "agent", "start", name, "--kind", AGENT, "--pane", created.result.root_pane.pane_id,
      ...(session ? ["--", "--session", session] : []),
    ]);
    this.send(name, sessionPrompt(prompt));
  },
  close(name) {
    run("herdr", ["workspace", "close", this.agent(name).workspace_id]);
  },
};

// A session's name is its block's label. Each ticket session gets a tab in the Rex session that started it, so one
// dispatcher's tickets sit together as its tabs; close closes that tab.
const rex = {
  tool: "rex",
  name(name) {
    run("rex", ["block", "rename", process.env.REX_BLOCK, name]);
  },
  blocks() {
    return json("rex", ["ls", "--json"]).sessions.flatMap(({ session_id }) =>
      json("rex", ["block", "ls", "-s", session_id, "--json"]).blocks.map((b) => ({ ...b, session_id })),
    );
  },
  // Rex resolves a block id only within the session given, so a call to another session's block names it.
  call(block, method) {
    return json("rex", ["block", "call", "-s", block.session_id, "-b", block.block_id, method]);
  },
  // A label outlives the program that took it, so a block counts as a session only while its agent runs in it.
  list() {
    return this.blocks()
      .filter((b) => b.creator_name === "com.superlogical.terminal")
      .filter((b) => SESSION_AGENTS.has(this.call(b, "process").foreground?.name))
      .map((b) => ({ name: b.label, state: this.blockState(b) }));
  },
  // A program reports its status with OSC 7501; Claude Code and Antigravity do once they detect a terminal that answers.
  blockState(block) {
    const { records } = this.call(block, "program_status");
    return normalState((records.find((r) => !r.id) ?? records[0])?.state);
  },
  state(name) {
    return this.blockState(this.block(name));
  },
  block(name) {
    const block = this.blocks().find((b) => b.label === name);
    if (!block) throw new Error(`no Rex block labelled ${name}`);
    return block;
  },
  send(name, text) {
    const { session_id, block_id } = this.block(name);
    run("rex", ["send", "-s", session_id, "-b", block_id, text]);
    run("rex", ["send-key", "-s", session_id, "-b", block_id, "enter"]);
  },
  start(name, { cwd, label, env, prompt }) {
    const session = process.env.REX_SESSION;
    const created = json("rex", [
      "window", "new", "-s", session, label, "--focus=false", "--cwd", cwd, "--json",
      "--", ...agentCommand(env, prompt, cwd),
    ]);
    run("rex", ["block", "rename", "-s", session, created.block_ids[0], name]);
  },
  close(name) {
    const { session_id, window_id } = this.block(name);
    run("rex", ["window", "close", "-s", session_id, window_id]);
  },
};

// herdr-core names a terminal only when it starts, so a session's name is its `session` label instead. The app shows a
// terminal only in the space and tab its `herdr.space` and `herdr.tab` labels name; an id it doesn't know becomes a
// new one, named after the terminal's folder, so start has no use for the label.
const hc = {
  tool: "herdr-core",
  terminal(address) {
    return json("hc", ["get", address, "--json"]);
  },
  find(name) {
    const [match] = json("hc", ["ls", "--json", "--label", `session=${name}`]).terminals;
    if (!match) throw new Error(`no herdr-core terminal labelled session=${name}`);
    return match.address;
  },
  name(name) {
    run("hc", ["label", process.env.HC_TERMINAL_ID, `session=${name}`]);
  },
  // A label outlives the program that took it, so a terminal counts as a session only while its agent runs in it.
  list() {
    return json("hc", ["ls", "--json"])
      .terminals.map((t) => this.terminal(t.address))
      .filter((t) => t.labels?.session && SESSION_AGENTS.has(t.foreground?.name))
      .map((t) => ({ name: t.labels.session, state: normalState(t.status?.state) }));
  },
  state(name) {
    return normalState(this.terminal(this.find(name)).status?.state);
  },
  send(name, text) {
    run("hc", ["send", this.find(name), text]);
  },
  start(name, { cwd, env, prompt }) {
    run("hc", [
      "run", "--bg", "--no-parent", "--json", "--cwd", cwd, "--label", `session=${name}`,
      "--label", `herdr.space=${name}`, "--label", `herdr.tab=${name}`,
      "--", ...agentCommand(env, prompt, cwd),
    ]);
  },
  close(name) {
    run("hc", ["kill", this.find(name)]);
  },
};

// The most specific variable first: a server started from another tool's pane passes that tool's variables on.
export function detect() {
  if (process.env.REX_BLOCK) return rex;
  if (process.env.HC_TERMINAL_ID) return hc;
  if (process.env.HERDR_ENV === "1") return herdr;
  return null;
}

function parseStart(args) {
  const split = args.indexOf("--");
  if (split < 0 || split === args.length - 1) throw new Error("start needs the prompt after --");
  const options = { env: [], prompt: args.slice(split + 1).join(" ") };
  const flags = args.slice(0, split);
  for (let i = 0; i < flags.length; i += 2) {
    const [flag, value] = [flags[i], flags[i + 1]];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--cwd") options.cwd = value;
    else if (flag === "--label") options.label = value;
    else if (flag === "--env") options.env.push(value);
    else throw new Error(`unknown option ${flag}`);
  }
  if (!options.cwd || !options.label) throw new Error("start needs --cwd and --label");
  return options;
}

function main([command, name, ...rest]) {
  const terminal = detect();
  if (!terminal) {
    console.error("not inside Herdr, the Herdr app or Rex");
    process.exit(1);
  }
  const needsName = () => {
    if (!name) throw new Error(`${command} needs a session name`);
  };
  switch (command) {
    case "inside":
      return console.log(JSON.stringify({ tool: terminal.tool }));
    case "list":
      return console.log(JSON.stringify(terminal.list()));
    case "state":
      needsName();
      return console.log(JSON.stringify({ name, state: terminal.state(name) }));
    case "name":
    case "close":
      needsName();
      return terminal[command](name);
    case "send":
      needsName();
      if (!rest.length) throw new Error("send needs the text");
      return terminal.send(name, rest.join(" "));
    case "start":
      needsName();
      return terminal.start(name, parseStart(rest));
    default:
      throw new Error(`unknown command ${command ?? "(none)"}; see the comment at the top of term.mjs`);
  }
}

// Compares real paths, since the script usually runs through a symlinked skill directory.
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
