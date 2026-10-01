# Computer setup — Thinking Experiment sims

Nothing syncs between computers except **GitHub** (code + `AGENTS.md` rules) and your **account sign-ins**.
Chat history in Claude, Codex, and Antigravity stays on the computer where it happened. So: push before you leave,
pull when you arrive.

## One-time setup on a new computer

1. Install: Git, GitHub CLI (`winget install GitHub.cli`), Node 22+, the Claude app, the ChatGPT app, Antigravity.
2. Sign in to GitHub **by username `vladimirlopez`** (not "Continue with Google" — that opens a different account):
   ```powershell
   gh auth login -h github.com          # choose HTTPS; approve in the browser as vladimirlopez
   gh auth refresh -h github.com -s workflow
   gh auth setup-git
   git config --global user.name  "Vladimir Lopez"
   git config --global user.email "43343770+vladimirlopez@users.noreply.github.com"
   ```
3. Sign in to each app with your personal account: Claude app, ChatGPT app (Codex uses the same login), Antigravity
   (Google account).
4. Get the workspace:
   ```powershell
   mkdir $HOME\Documents\TTE-Sims; cd $HOME\Documents\TTE-Sims
   gh repo clone Thinking-Experiment-Sims/sim-template
   ```
5. Check everything:
   ```powershell
   .\sim-template\scripts\check-setup.ps1
   ```

## Every session

- **Arriving:** run `check-setup.ps1`. Anything "behind GitHub" → `git pull`. To work on a sim from another computer:
  `.\sim-template\scripts\new-sim.ps1 -Name <repo> -Existing` (clones it and creates the agent folders).
- **Leaving:** run `check-setup.ps1` again. Anything "uncommitted", "NOT pushed", or "not on GitHub yet" exists only
  on this computer — have the agent commit and push (or `git push -u origin <branch>`).

## Confirm each AI actually loaded the rules

Open the agent's folder (e.g. `orbital-motion-sim--codex`) in its app and paste:

> Without changing any files: what branch prefix and commit trailer must you use, which CSS file must you never edit,
> and where do the physics equations go?

Correct answer from every app: its own prefix (`claude/`, `codex/`, `gemini/`) and trailer (`Agent: Claude` / `Codex`
/ `Gemini`), never edit `src/css/sim-core.css`, physics goes in `src/js/physics.js` with tests. If an app answers
vaguely, it didn't read `AGENTS.md` — check that the folder it opened is the repo root.
