#!/bin/sh
# Links every skill in this repo into each harness's user-level skills folder, so every harness, repo and worktree on
# the machine runs this checkout. Claude Code reads ~/.claude/skills; OpenCode reads both; Codex reads ~/.agents/skills.
#
#   install.sh          clone if missing, then link
#   install.sh --pull   fast-forward first, keeping the checkout as it is when it has local changes or the pull fails
#
# SKILLS_HOME overrides where the checkout lives (default ~/repos/skills).

set -eu

REPO_URL=https://github.com/jadfeitrouni/skills.git
SKILLS_HOME=${SKILLS_HOME:-$HOME/repos/skills}
TARGETS="$HOME/.claude/skills $HOME/.agents/skills"

say() { echo "skills: $*" >&2; }

if [ ! -d "$SKILLS_HOME/.git" ]; then
  git clone --quiet "$REPO_URL" "$SKILLS_HOME"
elif [ "${1:-}" = --pull ]; then
  if [ -n "$(git -C "$SKILLS_HOME" status --porcelain)" ]; then
    say "local changes in $SKILLS_HOME; not pulling"
  elif ! git -C "$SKILLS_HOME" pull --quiet --ff-only; then
    say "pull failed; keeping $(git -C "$SKILLS_HOME" rev-parse --short HEAD)"
  fi
fi

SOURCE="$SKILLS_HOME/skills"

for target in $TARGETS; do
  mkdir -p "$target"

  # A link into this checkout whose skill was deleted or renamed upstream.
  for link in "$target"/*; do
    [ -L "$link" ] || continue
    case "$(readlink "$link")" in
      "$SOURCE"/*) [ -e "$link" ] || unlink "$link" ;;
    esac
  done

  for skill in "$SOURCE"/*/; do
    skill=${skill%/}
    dest="$target/$(basename "$skill")"
    if [ -L "$dest" ]; then
      case "$(readlink "$dest")" in
        "$skill") ;;
        "$SOURCE"/*) ln -sfn "$skill" "$dest" ;;
        *) say "$dest links elsewhere; leaving it" ;;
      esac
    elif [ -e "$dest" ]; then
      say "$dest is not a link; leaving it"
    else
      ln -s "$skill" "$dest"
    fi
  done
done
