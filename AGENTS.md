# AGENTS.md — The Thinking Experiment Simulations

This is the single source of rules for every AI agent (Claude, Codex/ChatGPT, Gemini/Antigravity) working in a
**Thinking-Experiment-Sims** repo. `CLAUDE.md`, `GEMINI.md`, and `.agent/rules/` only point here. Edit this file, not those.

Owner: Vladimir Lopez — high school physics teacher (Houston). Audience: high school / AP Physics 1 students and teachers.
Sims are static sites served by GitHub Pages at `https://thinking-experiment-sims.github.io/<repo>/` and listed in the hub
`https://thinking-experiment-sims.github.io/interactive-physics/`.

**Older sims** (repos with no `src/css/sim-core.css`, created before `sim-template`): keep the repo's existing file
layout, class names, and styles. Do **not** restructure it into the template layout, add `sim-core.css`, or rewrite
working code unless Vladimir asks. Still apply: brand colors (§1.5), physics correctness, accessibility for anything
you add, tests for any physics you add or change (add `package.json` + `tests/` if missing), pedagogy (§4), and the
multi-agent workflow (§5). Where §1–§3 name template files, use this repo's equivalent.

---

## 1. Hard rules

1. **No build step.** Plain HTML + CSS + vanilla JS that runs by opening `index.html` or from GitHub Pages. No bundlers, no
   frameworks, no npm runtime dependencies. CDN libraries are allowed only when they earn their place (KaTeX for math,
   p5.js if the sim truly needs it) and must be pinned to an exact version.
2. **Physics is separate from the UI.** All equations live in `src/js/physics.js`: pure functions, no DOM, no canvas,
   SI units, exported with the UMD wrapper already in that file so the browser *and* `node --test` can load it.
3. **Every physics function has a test** in `tests/physics.test.js` using `node:test`. Prefer values a student could
   check by hand or values taken from the worksheet the sim accompanies. `npm test` must pass before you commit.
4. **Use the shared design system.** `src/css/sim-core.css` is shared across all sims — **do not edit it inside a sim
   repo**. Put sim-specific styles in `src/css/sim.css`. Use the existing classes (§3) before inventing new ones.
5. **Brand: teal + amber only.** Teal `#0f7e9b` / `#095f76`, amber `#d67b19`, ink `#123140`, muted `#4b6570`,
   blueprint background `#e9f4fb`. Fonts: Inter, IBM Plex Sans. **Never** purple (`#59118e`) or school gold (`#ffc61e`) —
   that is a different (Kinkaid classroom-document) brand.
6. **Light and dark mode both work.** Theme is `body[data-theme="dark"]`, toggled by `#themeToggle`, saved in
   `localStorage` key `te-theme`. Canvas drawing must read colors from CSS variables (see `cssVar()` in `app.js`) so the
   canvas follows the theme.
7. **Accessible.** Every input has a `<label>`; canvases have `role="img"` and an `aria-label`; live readouts use
   `aria-live`; keyboard focus is visible; works at 380 px wide.

## 2. File layout

```
index.html            page structure (hero, controls, canvas, readouts, tabs, trials table, footer)
src/css/sim-core.css  shared design system — DO NOT EDIT in a sim repo
src/css/sim.css       this sim's own styles
src/js/physics.js     pure physics (UMD) — tested
src/js/app.js         DOM wiring, animation loop, canvas rendering
tests/physics.test.js node:test unit tests
PHYSICS.md            teacher-facing theory, equations, derivations, misconceptions, worked examples
README.md             what the sim is, live link, how to use it in class
SETUP.md              per-computer setup and sync checklist (for Vladimir; leave as is)
scripts/              new-sim.ps1 (create sim + agent worktrees), check-setup.ps1 (verify a computer)
favicon.png           TTE favicon
```

## 3. Design-system classes (from `sim-core.css`)

| Purpose | Markup |
|---|---|
| Page wrapper / background | `<div class="bg-grid" aria-hidden="true">` then `<div class="shell">` |
| Header | `header.hero > .hero-top`, `.kicker`, `h1`, `.subtitle`, `a.brand-badge` (back to hub), `.lab-badge` |
| Layout (12-col grid) | `main.app-layout` with `section.panel` + `.narrow` (4) / `.wide` (8) / `.full` (12) |
| Panel heading | `.panel-head > h2 + .info-line`; small text `.hint` |
| Inputs | `.controls-grid` (2-col) of `<label>Text<input …></label>`; sliders `label.range-label` with a `<span>` value |
| Checkboxes | `.toggle-group > label.toggle-line` |
| Buttons | `button` (teal), `button.primary`, `button.ghost`, `button.amber`; group in `.button-row` (`.compact`) |
| Status line | `p.status` (+ `.ok` / `.warn` / `.error`), `aria-live="polite"` |
| Presets | `.preset-box > h3 + .button-row.compact > button.ghost[data-preset]` |
| Canvas | `canvas.sim-canvas` |
| Live readouts | `dl.metrics-grid > div > dt + dd` |
| Tabs | `.tab-nav > button.tab-btn[data-tab]` and `.tab-panel#<name>Tab` |
| Guided questions | `details > summary + p` |
| Data table | `.table-wrap > table` |
| Callouts | `.callout` (teal), `.callout.amber` |

If a sim genuinely needs a new reusable component, build it in `sim.css`, then mention it in your PR so it can be
promoted to `sim-core.css` in the `sim-template` repo.

## 4. Pedagogy conventions

- Inquiry first: students predict → test → explain. The **Guided Discovery** tab holds numbered `<details>` prompts that
  each end in a **Question:** for the student. Don't hand over the answer in the prompt.
- Show units everywhere (`m/s`, `m/s²`, `N`). Use `g = 9.8 m/s²` unless the activity says otherwise. State the sign
  convention (which direction is positive) in a `.hint` near the controls.
- Prefer Modeling Instruction representations where relevant: motion maps, x–t / v–t / a–t graphs, force diagrams,
  energy bar charts, T-charts.
- Provide a **Record Trial** button + table when students are expected to collect data.
- Address a known misconception explicitly in `PHYSICS.md` and, where possible, with a scenario/preset in the sim.
- Language a 10th grader can read. No unexplained jargon.

## 5. Multi-agent workflow

Several AIs may build competing versions of the same sim and critique each other. Rules:

- **Never commit to `main`.** Work on your own branch: `claude/<topic>`, `codex/<topic>`, or `gemini/<topic>`.
- **Work in your own folder.** Each agent has its own git worktree (e.g. `orbit-sim--claude`). Do not edit files in
  another agent's worktree.
- **Commit messages** end with a trailer naming the agent, because all agents commit as Vladimir:
  `Agent: Claude` / `Agent: Codex` / `Agent: Gemini`.
- **Open a pull request** to `main` when a version is ready (`gh pr create`), filling in the PR template. Vladimir
  merges; agents never merge their own PRs.
- **Reviewing another agent's PR** (`gh pr view <n>`, `gh pr diff <n>`, `gh pr checkout <n>` in a scratch worktree):
  1. Run `npm test`. Open `index.html` and actually use the sim in light and dark mode and at phone width.
  2. Check the physics against `PHYSICS.md` and by hand for at least one case. Wrong physics is the most serious defect.
  3. Check every hard rule in §1, then pedagogy (§4), then code quality.
  4. Post findings with `gh pr review <n> --comment --body-file <file>`, headed `Review by <Agent>`. Rank by severity
     (**Blocker / Should fix / Nice to have**), each with file:line, what is wrong, and a concrete fix. Say what the
     other version does better than yours, too — the goal is the best sim, not winning.
  5. Don't push commits to another agent's branch unless Vladimir asks.

## 6. Checklist before opening a PR

- [ ] `npm test` passes; new physics has tests
- [ ] No console errors; works from `file://` and GitHub Pages
- [ ] Light + dark mode checked; 380 px wide checked
- [ ] `sim-core.css` untouched; only teal/amber palette
- [ ] Title, `<meta name="description">`, README, and PHYSICS.md describe *this* sim (no template leftovers)
- [ ] Commit trailer `Agent: <name>`
