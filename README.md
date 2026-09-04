# Lab: Downhill Motion (Uniform Acceleration Simulation)

An interactive Modeling Physics simulation directly aligned with the student laboratory document **"Lab: Downhill Motion"**.

Authored as part of **The Thinking Experiment** (PhysicsKit):
👉 [https://thinking-experiment-sims.github.io/interactive-physics/](https://thinking-experiment-sims.github.io/interactive-physics/)

---

## 🎯 Pedagogical Objectives

Students investigate an object moving downhill with nearly constant acceleration to discover:
1. **Changing Motion on an Incline**:
   - A cart rolling downhill covers more distance each second than the second before.
   - Position grows quadratically with time ($x \propto t^2$).
2. **Dual Timing & Data Collection (Part 2)**:
   - **Auto Mode (Photogate Array)**: Logs precise timestamps as the cart breaks infrared beams at 6+ positions along the track ($0.20, 0.40, 0.70, 1.10, 1.60, 2.20\text{ m}$).
   - **Manual Mode (Stopwatch / Spacebar Split)**: Captures human reaction time latency ($\pm 0.12\text{--}0.20\text{ s}$) to teach experimental uncertainty and curve fitting.
3. **Quadratic Regression & Tangent Line Slopes (Parts 3 & 4)**:
   - Fit a quadratic curve to $(t, x)$ data: $x(t) = A t^2 + B t + C$.
   - Use the **Interactive Tangent Line Inspector** or the hub's dedicated **Tangent Line Analysis** tool (`slope_tangents`) to determine instantaneous velocities ($v = \frac{dx}{dt}$) from the slopes of the tangent lines.
4. **Instantaneous Velocity-Time Model & Synthesis (Parts 5, 6, & 7)**:
   - Construct the linear $v-t$ model: $v(t) = m t + b$.
   - **Compare Coefficients**:
     - The second-degree coefficient in the position equation is half the slope of the velocity equation: $A = \frac{1}{2}m = \frac{1}{2}a$.
     - The first-degree coefficient equals the $y$-intercept of the velocity equation: $B = b = v_0$.
   - State the physical meanings of slopes and intercepts ($x_0$, $v_0$, $a$).
   - Derive the general kinematic equations:
     $$x(t) = \frac{1}{2}a t^2 + v_0 t + x_0$$
     $$v(t) = a t + v_0$$

---

## 🎨 Design System Compliance

Strictly adheres to **The Thinking Experiment** brand guidelines (`DESIGN_SYSTEM.md`):
- **Teal Headers / Primary**: `#0f7e9b` (Dark: `#095f76`, Light: `#e6f4f8`)
- **Amber Accents / Highlights**: `#d67b19` (Dark: `#b86510`, Light: `#fff8ed`)
- **Background**: Pure white `#ffffff` cards on `#e9f4fb` blueprint grid
- **Strictly Prohibited**: Zero purple (`#59118e`) and zero gold (`#ffc61e`)
- **Canvas Safety**: Uses explicit path helpers (`drawRoundedRect` via `arcTo`, never `ctx.roundRect`)
- **Math Typography**: Semantic HTML (`<span class="math-expr">`)

---

## 📁 Repository Structure

```
downhill-motion-sim/
├── index.html                   # Main UI, simulation canvas, dual graphs, lab analysis
├── styles.css                   # The Thinking Experiment design system
├── favicon.png                  # Brand icon
├── package.json                 # ES module metadata & test script
├── README.md                    # Simulation documentation
├── src/
│   ├── downhillPhysics.js       # Pure kinematics math, incline equations, regressions
│   └── downhillApp.js           # Apparatus rendering, animation loop, canvas graphs, UI
└── tests/
    └── downhillPhysics.test.js  # Node.js automated unit tests
```

---

## 🧪 Running Unit Tests

Run automated physics and regression tests using Node.js built-in test runner:
```bash
npm test
# or
node --test tests/downhillPhysics.test.js
```

---

## 🚀 Running Locally

No build step, bundler, or dependencies required.
Using Python:
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000` in your web browser.

---

## 📄 License & Attribution

© 2026 Vladimir Lopez · The Thinking Experiment · Interactive Physics Simulations
