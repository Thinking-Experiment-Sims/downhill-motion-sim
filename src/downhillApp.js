/**
 * downhillApp.js - Interactive UI, Canvas Graphics, Metronome & Galileo Renaissance Controller
 * 
 * Part of "The Thinking Experiment" (PhysicsKit).
 * Strictly complies with DESIGN_SYSTEM.md:
 * - Palette: Teal (#0f7e9b), Amber (#d67b19), White (#ffffff), Grid (#e9f4fb).
 * - Cross-browser safe canvas rendering: uses arcTo helper (NO ctx.roundRect).
 * - Dynamic geometry prevents cart clipping at all ramp angles (even 15°).
 * - Front bumper tracking: initial position equals cart length (x0 = 0.16m).
 * - Galileo Galilei Renaissance 1638 Mode with bronze sphere, chime bells, and water clock.
 * - Web Audio API synthesized wooden metronome tick & brass chime.
 */

import {
  GRAVITY,
  calculateInclineAcceleration,
  positionAtTime,
  velocityAtTime,
  timeAtPosition,
  linearRegression,
  quadraticRegression,
  calculateTangent,
  addReactionTimeJitter,
  formatDataForExport
} from './downhillPhysics.js';

// Cross-browser safe rounded rectangle path helper (NO ctx.roundRect)
function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Web Audio API synthesizer for wooden metronome ticks and Galileo brass bell chimes
 */
class MetronomeAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTick(isAccent = false) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isAccent ? 1250 : 880, now);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.045);
    } catch (e) {}
  }

  playBell(pitch = 1100) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, now);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.40);
    } catch (e) {}
  }
}

export class DownhillMotionApp {
  constructor() {
    // Physical dimensions
    this.trackLength = 2.40;     // meters
    this.cartLengthMeters = 0.16; // 16 cm cart length
    this.x0 = this.cartLengthMeters; // Front bumper starts at length of cart (0.16m)!
    this.v0 = 0.00;              // m/s
    this.angleDeg = 4.0;         // default angle
    this.muFriction = 0.003;     // low-friction dynamics cart

    // Simulation state
    this.isRunning = false;
    this.simSpeed = 1.0;
    this.currentTime = 0.0;
    this.currentX = this.x0; // Front bumper position
    this.currentV = 0.00;
    this.currentA = 0.00;
    this.lastFrameTime = null;
    this.animFrameId = null;

    // Display options
    this.showVectors = true;
    this.showTickerMarks = false;
    this.tickerMarks = [];
    this.lastTickerTime = 0;
    this.tickerInterval = 0.20;

    // Lab Mode: 'metronome' | 'photogate' | 'stopwatch' | 'galileo'
    this.labMode = 'metronome';

    // Audio & Metronome
    this.audio = new MetronomeAudio();
    this.metronomeInterval = 1.00; // 1 second
    this.currentBeat = 0;
    this.nextBeatTime = 1.00;
    this.markedBeats = new Map();

    // Photogates array for Photogate mode (front bumper triggers)
    this.photogates = [0.30, 0.60, 1.00, 1.45, 1.95, 2.35];
    this.passedGates = new Set();
    this.gateFlashMap = new Map();

    // Galileo frets / bells (placed along the groove)
    this.galileoBells = [
      { id: 1, note: 'C5', x: 0.25, rung: false, chimeTime: null, freq: 523.25 },
      { id: 2, note: 'D5', x: 0.52, rung: false, chimeTime: null, freq: 587.33 },
      { id: 3, note: 'E5', x: 0.97, rung: false, chimeTime: null, freq: 659.25 },
      { id: 4, note: 'G5', x: 1.60, rung: false, chimeTime: null, freq: 783.99 },
      { id: 5, note: 'A5', x: 2.40, rung: false, chimeTime: null, freq: 880.00 }
    ];
    this.galileoChimes = [];
    this.hoveredBell = null;
    this.draggingBell = null;
    this.bellRipples = [];

    // Data points & models
    this.recordedPoints = [];
    this.quadFit = null;
    this.linearFit = null;
    this.instantaneousVelocities = [];

    // Tangent Inspector
    this.scrubTime = 0.0;

    // Cache DOM Elements
    this.initDOMElements();
    this.initCanvases();
    this.attachEventListeners();

    this.updateAcceleration();
    this.setLabMode('metronome');
    this.resetSimulation();
    this.renderAll();
  }

  initDOMElements() {
    // Mode tabs
    this.tabMetronome = document.getElementById('tabMetronome');
    this.tabPhotogate = document.getElementById('tabPhotogate');
    this.tabStopwatch = document.getElementById('tabStopwatch');
    this.tabGalileo = document.getElementById('tabGalileo');

    // Panels
    this.panelMetronome = document.getElementById('panelMetronome');
    this.panelGalileoBells = document.getElementById('panelGalileoBells');
    this.panelStopwatch = document.getElementById('panelStopwatch');
    this.panelGalileoHistory = document.getElementById('panelGalileoHistory');

    // Galileo Bell Controls & Presets
    this.tbodyGalileoChimes = document.getElementById('tbodyGalileoChimes');
    this.verdictGalileoTempo = document.getElementById('verdictGalileoTempo');
    this.btnPresetGalileoOdd = document.getElementById('btnPresetGalileoOdd');
    this.btnPresetGalileoEqualDist = document.getElementById('btnPresetGalileoEqualDist');
    this.btnPresetGalileoScramble = document.getElementById('btnPresetGalileoScramble');
    this.btnTransferGalileoData = document.getElementById('btnTransferGalileoData');

    this.fretSliders = [];
    this.fretVals = [];
    this.fretDists = [];
    this.fretCards = [];
    for (let i = 1; i <= 5; i++) {
      this.fretSliders.push(document.getElementById(`sliderFret${i}`));
      this.fretVals.push(document.getElementById(`valFret${i}`));
      this.fretDists.push(document.getElementById(`distFret${i}`));
      this.fretCards.push(document.getElementById(`cardFret${i}`));
    }

    // Metronome controls
    this.metronomeLed = document.getElementById('metronomeLed');
    this.btnMarkBeat = document.getElementById('btnMarkBeat');
    this.btnMuteSound = document.getElementById('btnMuteSound');
    this.valCurrentBeat = document.getElementById('valCurrentBeat');
    this.btnAutoDropMarks = document.getElementById('btnAutoDropMarks');
    this.btnSplit = document.getElementById('btnSplit');

    // Toolbar buttons
    this.btnPlay = document.getElementById('btnPlay');
    this.btnReset = document.getElementById('btnReset');
    this.btnStep = document.getElementById('btnStep');
    this.btnSlowMo = document.getElementById('btnSlowMo');
    this.btnClearData = document.getElementById('btnClearData');
    this.btnSampleData = document.getElementById('btnSampleData');
    this.btnCopyData = document.getElementById('btnCopyData');
    this.btnExportCSV = document.getElementById('btnExportCSV');
    this.btnSendToTangentSim = document.getElementById('btnSendToTangentSim');

    // Sliders & Toggles
    this.sliderAngle = document.getElementById('sliderAngle');
    this.valAngle = document.getElementById('valAngle');
    this.lblAngleTitle = document.getElementById('lblAngleTitle');
    this.descAngle = document.getElementById('descAngle');
    this.chkFriction = document.getElementById('chkFriction');
    this.chkVectors = document.getElementById('chkVectors');
    this.chkTicker = document.getElementById('chkTicker');
    this.lblVectors = document.getElementById('lblVectors');
    this.lblTicker = document.getElementById('lblTicker');

    // Metrics Bars
    this.barModernMetrics = document.getElementById('barModernMetrics');
    this.barGalileoMetrics = document.getElementById('barGalileoMetrics');
    this.metricGalileoAngle = document.getElementById('metricGalileoAngle');
    this.metricGalileoPos = document.getElementById('metricGalileoPos');
    this.metricGalileoWater = document.getElementById('metricGalileoWater');
    this.metricGalileoBells = document.getElementById('metricGalileoBells');
    this.metricGalileoCadence = document.getElementById('metricGalileoCadence');

    // Readout metrics (Modern)
    this.metricTime = document.getElementById('metricTime');
    this.metricPos = document.getElementById('metricPos');
    this.metricVel = document.getElementById('metricVel');
    this.metricAcc = document.getElementById('metricAcc');
    this.metricAngle = document.getElementById('metricAngle');

    // Modern Analysis Grid
    this.panelModernAnalysis = document.getElementById('panelModernAnalysis');

    // Tables & Badges
    this.tbodyData = document.getElementById('tbodyData');
    this.tbodyVel = document.getElementById('tbodyVel');
    this.badgeQuadFit = document.getElementById('badgeQuadFit');
    this.badgeLinearFit = document.getElementById('badgeLinearFit');

    // Tangent controls
    this.sliderTangent = document.getElementById('sliderTangent');
    this.valTangentTime = document.getElementById('valTangentTime');
    this.valTangentSlope = document.getElementById('valTangentSlope');

    // Mathematical modeling equations
    this.mathModelEqPos = document.getElementById('mathModelEqPos');
    this.mathModelEqVel = document.getElementById('mathModelEqVel');
    this.cmpCoeffA = document.getElementById('cmpCoeffA');
    this.cmpSlopeM = document.getElementById('cmpSlopeM');
    this.cmpCoeffB = document.getElementById('cmpCoeffB');
    this.cmpInterceptB = document.getElementById('cmpInterceptB');
    this.panelParts67 = document.getElementById('panelParts67');
    this.heroTag = document.getElementById('heroTag');
    this.heroTitle = document.getElementById('heroTitle');
    this.heroSubtitle = document.getElementById('heroSubtitle');
    this.toastNotification = document.getElementById('toastNotification');
  }

  initCanvases() {
    this.canvasApp = document.getElementById('simCanvas');
    this.ctxApp = this.canvasApp.getContext('2d');

    this.canvasXT = document.getElementById('canvasXT');
    this.ctxXT = this.canvasXT.getContext('2d');

    this.canvasVT = document.getElementById('canvasVT');
    this.ctxVT = this.canvasVT.getContext('2d');

    const resizeObserver = new ResizeObserver(() => {
      this.scaleCanvas(this.canvasApp, this.ctxApp);
      this.scaleCanvas(this.canvasXT, this.ctxXT);
      this.scaleCanvas(this.canvasVT, this.ctxVT);
      this.renderAll();
    });

    resizeObserver.observe(this.canvasApp);
    resizeObserver.observe(this.canvasXT);
    resizeObserver.observe(this.canvasVT);
  }

  scaleCanvas(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
  }

  attachEventListeners() {
    // Mode tabs
    this.tabMetronome.addEventListener('click', () => this.setLabMode('metronome'));
    this.tabPhotogate.addEventListener('click', () => this.setLabMode('photogate'));
    if (this.tabStopwatch) {
      this.tabStopwatch.addEventListener('click', () => this.setLabMode('stopwatch'));
    }
    if (this.tabGalileo) {
      this.tabGalileo.addEventListener('click', () => this.setLabMode('galileo'));
    }

    // Metronome controls
    this.btnMuteSound.addEventListener('click', () => {
      this.audio.enabled = !this.audio.enabled;
      this.btnMuteSound.textContent = this.audio.enabled ? '🔊 Audio ON' : '🔇 Muted';
      this.btnMuteSound.classList.toggle('btn-accent', this.audio.enabled);
      this.btnMuteSound.classList.toggle('btn-ghost', !this.audio.enabled);
      if (this.audio.enabled) {
        if (this.labMode === 'galileo') {
          this.audio.playBell(1100);
        } else {
          this.audio.playTick(true);
        }
      }
    });

    this.btnMarkBeat.addEventListener('click', () => this.recordMetronomeMark());

    if (this.btnSplit) {
      this.btnSplit.addEventListener('click', () => this.recordManualSplit());
    }

    if (this.btnAutoDropMarks) {
      this.btnAutoDropMarks.addEventListener('click', () => this.autoDropCurrentMarks());
    }

    // Spacebar listener: triggers mark or split
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.labMode === 'metronome' || this.labMode === 'galileo') {
          if (!this.isRunning && this.currentTime === 0) {
            this.startSimulation();
          } else {
            this.recordMetronomeMark();
          }
        } else if (this.labMode === 'stopwatch') {
          this.recordManualSplit();
        }
      }
    });

    // Incline canvas click allows student to click directly on track to mark in metronome mode
    this.canvasApp.addEventListener('click', (e) => {
      if (this.labMode === 'metronome') {
        const rect = this.canvasApp.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        this.handleTrackClick(clickX);
      }
    });

    // Interactive Galileo Bell Dragging on Canvas (Pointer events for mouse & touch)
    this.canvasApp.addEventListener('pointerdown', (e) => this.handleCanvasPointerDown(e));
    window.addEventListener('pointermove', (e) => this.handleCanvasPointerMove(e));
    window.addEventListener('pointerup', (e) => this.handleCanvasPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.handleCanvasPointerUp(e));

    // Galileo Fret Sliders
    this.fretSliders.forEach((slider, idx) => {
      if (slider) {
        slider.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          this.galileoBells[idx].x = val;
          this.updateGalileoBellUI();
          if (!this.isRunning) {
            this.resetSimulation();
          }
          this.renderApparatus();
        });
      }
    });

    // Galileo Preview Chime Buttons
    document.querySelectorAll('.btn-ring-preview').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const fretId = parseInt(e.currentTarget.getAttribute('data-fret'), 10);
        const bell = this.galileoBells.find(b => b.id === fretId);
        if (bell) {
          this.audio.playBell(bell.freq);
          this.bellRipples.push({
            x: bell.x,
            freq: bell.freq,
            startTime: performance.now(),
            duration: 600
          });
          this.renderApparatus();
        }
      });
    });

    // Galileo Presets
    if (this.btnPresetGalileoOdd) {
      this.btnPresetGalileoOdd.addEventListener('click', () => this.applyGalileoPreset('odd'));
    }
    if (this.btnPresetGalileoEqualDist) {
      this.btnPresetGalileoEqualDist.addEventListener('click', () => this.applyGalileoPreset('equal_dist'));
    }
    if (this.btnPresetGalileoScramble) {
      this.btnPresetGalileoScramble.addEventListener('click', () => this.applyGalileoPreset('scramble'));
    }

    // Galileo Data Transfer
    if (this.btnTransferGalileoData) {
      this.btnTransferGalileoData.addEventListener('click', () => this.transferGalileoData());
    }

    // Simulation controls
    this.btnPlay.addEventListener('click', () => this.togglePlay());
    this.btnReset.addEventListener('click', () => this.resetSimulation());
    this.btnStep.addEventListener('click', () => this.stepSimulation());
    this.btnSlowMo.addEventListener('click', () => {
      this.simSpeed = this.simSpeed === 1.0 ? 0.5 : 1.0;
      this.btnSlowMo.classList.toggle('btn-accent', this.simSpeed === 0.5);
      this.btnSlowMo.textContent = this.simSpeed === 0.5 ? '🐢 Slow Mo (0.5x)' : '⚡ Normal (1.0x)';
    });

    // Incline Angle Slider
    this.sliderAngle.addEventListener('input', (e) => {
      this.angleDeg = parseFloat(e.target.value);
      this.valAngle.textContent = `${this.angleDeg.toFixed(1)}°`;
      this.metricAngle.textContent = `${this.angleDeg.toFixed(1)}°`;
      this.updateAcceleration();
      if (!this.isRunning) {
        this.resetSimulation();
      }
    });

    // Toggles
    this.chkFriction.addEventListener('change', (e) => {
      this.muFriction = e.target.checked ? 0.003 : 0.0;
      this.updateAcceleration();
    });

    this.chkVectors.addEventListener('change', (e) => {
      this.showVectors = e.target.checked;
      this.renderApparatus();
    });

    this.chkTicker.addEventListener('change', (e) => {
      this.showTickerMarks = e.target.checked;
      this.renderApparatus();
    });

    // Tangent Slider
    this.sliderTangent.addEventListener('input', (e) => {
      this.scrubTime = parseFloat(e.target.value);
      this.updateTangentUI();
      this.renderGraphs();
    });

    // Data Actions
    this.btnClearData.addEventListener('click', () => this.clearData());
    this.btnSampleData.addEventListener('click', () => this.loadSampleData());
    this.btnCopyData.addEventListener('click', () => this.copyDataToClipboard('tsv'));
    this.btnExportCSV.addEventListener('click', () => this.downloadCSV());
    this.btnSendToTangentSim.addEventListener('click', () => this.openInTangentSim());

    // Graph click to set tangent time
    this.canvasXT.addEventListener('click', (e) => {
      const rect = this.canvasXT.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const t = this.pixelToTimeXT(clickX);
      if (t >= 0 && t <= this.getMaxGraphTime()) {
        this.scrubTime = t;
        this.sliderTangent.value = t;
        this.updateTangentUI();
        this.renderGraphs();
      }
    });
  }

  setLabMode(mode) {
    this.labMode = mode;
    this.tabMetronome.classList.toggle('active', mode === 'metronome');
    this.tabPhotogate.classList.toggle('active', mode === 'photogate');
    if (this.tabStopwatch) {
      this.tabStopwatch.classList.toggle('active', mode === 'stopwatch');
    }
    if (this.tabGalileo) {
      this.tabGalileo.classList.toggle('active', mode === 'galileo');
    }

    // Show/hide mode panels
    if (this.panelMetronome) {
      this.panelMetronome.style.display = mode === 'metronome' ? 'flex' : 'none';
    }
    if (this.panelGalileoBells) {
      this.panelGalileoBells.style.display = mode === 'galileo' ? 'block' : 'none';
    }
    if (this.panelStopwatch) {
      this.panelStopwatch.style.display = mode === 'stopwatch' ? 'block' : 'none';
    }
    if (this.panelGalileoHistory) {
      this.panelGalileoHistory.style.display = mode === 'galileo' ? 'block' : 'none';
    }

    // Modern analysis panel & Parts 6 & 7 Guide are HIDDEN in Galileo mode (Galileo did not use clocks or calculus tangents)
    if (this.panelModernAnalysis) {
      this.panelModernAnalysis.style.display = mode === 'galileo' ? 'none' : 'grid';
    }
    if (this.panelParts67) {
      this.panelParts67.style.display = mode === 'galileo' ? 'none' : 'block';
    }

    // Toggle full Renaissance aesthetic theme on document body
    document.body.classList.toggle('theme-galileo', mode === 'galileo');

    // Dynamic hero header banner for Renaissance mode
    if (this.heroTag && this.heroTitle && this.heroSubtitle) {
      if (mode === 'galileo') {
        this.heroTag.textContent = '📜 Renaissance Historical Experiment (1638)';
        this.heroTitle.textContent = 'Galileo: Diluting Gravity (De Motu Accelerato)';
        this.heroSubtitle.textContent = 'Reconstruct Galileo\'s classic inclined plane experiment. Listen to the musical cadence of the brass bells, adjust sheep-gut frets to test the odd-number rule, and measure time with the Clepsydra water balance.';
      } else {
        this.heroTag.textContent = '📐 Physics Lab Activity';
        this.heroTitle.textContent = 'Lab: Downhill Motion';
        this.heroSubtitle.textContent = 'Determine the mathematical relationship between position and time for an object rolling down an incline with constant acceleration, and use the graph\'s tangent slopes to construct an instantaneous velocity-time model.';
      }
    }

    // Metrics bar toggle
    if (this.barModernMetrics) {
      this.barModernMetrics.style.display = mode === 'galileo' ? 'none' : 'flex';
    }
    if (this.barGalileoMetrics) {
      this.barGalileoMetrics.style.display = mode === 'galileo' ? 'flex' : 'none';
    }

    // Sidebar toggles for vectors and ticker (irrelevant in Renaissance wood beam)
    if (this.lblVectors) {
      this.lblVectors.style.display = mode === 'galileo' ? 'none' : '';
    }
    if (this.lblTicker) {
      this.lblTicker.style.display = mode === 'galileo' ? 'none' : '';
    }
    if (this.lblAngleTitle) {
      this.lblAngleTitle.textContent = mode === 'galileo' ? 'Groove Elevation Angle (θ)' : 'Incline Angle (θ)';
    }
    if (this.descAngle) {
      this.descAngle.textContent = mode === 'galileo'
        ? 'Galileo diluted gravity using gentle elevations between 1° and 6°.'
        : 'Steeper angle increases downhill acceleration: a = g sin(θ)';
    }

    // Set appropriate incline angle for mode
    if (mode === 'metronome' || mode === 'galileo') {
      this.angleDeg = 4.0;
      this.sliderAngle.value = 4.0;
      this.valAngle.textContent = '4.0°';
      this.metricAngle.textContent = '4.0°';
      this.updateAcceleration();
    } else if (mode === 'stopwatch') {
      this.angleDeg = 5.0;
      this.sliderAngle.value = 5.0;
      this.valAngle.textContent = '5.0°';
      this.metricAngle.textContent = '5.0°';
      this.updateAcceleration();
    } else {
      this.angleDeg = 6.0;
      this.sliderAngle.value = 6.0;
      this.valAngle.textContent = '6.0°';
      this.metricAngle.textContent = '6.0°';
      this.updateAcceleration();
    }

    if (mode === 'galileo') {
      this.updateGalileoBellUI();
      this.updateGalileoChimeTable();
    }

    // Automatically erase previous data when clicking a different tab
    this.clearData();
    this.resetSimulation();
  }

  updateAcceleration() {
    this.currentA = calculateInclineAcceleration(this.angleDeg, this.muFriction);
    this.metricAcc.textContent = `${this.currentA.toFixed(2)} m/s²`;
  }

  togglePlay() {
    if (this.isRunning) {
      this.pauseSimulation();
    } else {
      this.startSimulation();
    }
  }

  startSimulation() {
    this.audio.init();

    // If starting a new run or if cart reached the end, clear previous data
    if (this.currentX >= this.trackLength) {
      this.clearData();
      this.resetSimulation();
    } else if (this.currentTime === 0.0) {
      this.clearData();
    }

    // Auto-log release point t = 0.00s at front bumper position x0 = 0.16m
    if (this.currentTime === 0.0) {
      if (this.labMode === 'metronome') {
        this.audio.playTick(true);
        this.flashMetronomeLed();
        this.markedBeats.set(0, { beat: 0, t: 0.00, x: this.x0, actualX: this.x0 });
        this.addRecordPoint(0.00, this.x0, 0.00, this.labMode);
      } else if (this.labMode === 'galileo') {
        this.audio.playBell(440);
      }
    }

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.btnPlay.textContent = '⏸ Pause';
    this.btnPlay.classList.remove('btn-primary');
    this.btnPlay.classList.add('btn-ghost');
    this.animFrameId = requestAnimationFrame((ts) => this.simulationLoop(ts));
  }

  pauseSimulation() {
    this.isRunning = false;
    this.btnPlay.textContent = '▶ Start Motion';
    this.btnPlay.classList.remove('btn-ghost');
    this.btnPlay.classList.add('btn-primary');
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  resetSimulation() {
    this.pauseSimulation();
    this.currentTime = 0.0;
    this.currentX = this.x0; // Front bumper starts at x0 (0.16m)!
    this.currentV = this.v0;
    this.currentBeat = 0;
    this.nextBeatTime = this.metronomeInterval;
    this.tickerMarks = [{ x: this.x0, t: 0.0 }];
    this.lastTickerTime = 0.0;
    this.passedGates.clear();
    this.gateFlashMap.clear();

    // Reset Galileo bells
    for (const bell of this.galileoBells) {
      bell.rung = false;
      bell.chimeTime = null;
    }
    this.galileoChimes = [];
    this.bellRipples = [];
    this.updateGalileoChimeTable();

    if (this.valCurrentBeat) {
      this.valCurrentBeat.textContent = 'Beat #0 (Ready / Release)';
    }

    this.updateReadouts();
    this.renderAll();
  }

  stepSimulation() {
    this.pauseSimulation();
    const dt = 0.04;
    this.advancePhysics(dt);
    this.updateReadouts();
    this.renderAll();
  }

  simulationLoop(timestamp) {
    if (!this.isRunning) return;

    const deltaMs = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    const dt = Math.min(0.05, (deltaMs / 1000) * this.simSpeed);
    this.advancePhysics(dt);

    if (this.currentX >= this.trackLength) {
      this.currentX = this.trackLength;
      this.currentV = velocityAtTime(this.currentTime, this.v0, this.currentA);
      this.pauseSimulation();
      this.showToast('🏁 Cart reached the end of the track');
    }

    this.updateReadouts();
    this.renderAll();

    if (this.isRunning) {
      this.animFrameId = requestAnimationFrame((ts) => this.simulationLoop(ts));
    }
  }

  advancePhysics(dt) {
    this.currentTime += dt;
    this.currentX = positionAtTime(this.currentTime, this.x0, this.v0, this.currentA);
    this.currentV = velocityAtTime(this.currentTime, this.v0, this.currentA);

    // Metronome 1-second beat tracking (only in Metronome mode)
    if (this.labMode === 'metronome') {
      if (this.currentTime >= this.nextBeatTime && this.currentX < this.trackLength) {
        this.currentBeat++;
        this.nextBeatTime += this.metronomeInterval;
        this.audio.playTick(this.currentBeat === 1);
        this.flashMetronomeLed();

        if (this.valCurrentBeat) {
          this.valCurrentBeat.textContent = `Beat #${this.currentBeat} (${(this.currentBeat * this.metronomeInterval).toFixed(1)}s)`;
        }
      }
    }

    // Galileo bells checking: chime when bronze ball rolls past fret
    if (this.labMode === 'galileo') {
      for (let i = 0; i < this.galileoBells.length; i++) {
        const bell = this.galileoBells[i];
        if (!bell.rung && this.currentX >= bell.x) {
          bell.rung = true;
          bell.chimeTime = this.currentTime;
          this.audio.playBell(bell.freq);
          this.bellRipples.push({
            x: bell.x,
            freq: bell.freq,
            startTime: performance.now(),
            duration: 600
          });

          // Compute interval Δt and distance Δx
          const prevTime = this.galileoChimes.length > 0 ? this.galileoChimes[this.galileoChimes.length - 1].t : 0.00;
          const prevX = this.galileoChimes.length > 0 ? this.galileoChimes[this.galileoChimes.length - 1].x : this.x0;
          const dt = Math.max(0.01, bell.chimeTime - prevTime);
          const dx = Math.max(0.00, bell.x - this.x0);
          const stepDx = Math.max(0.00, bell.x - prevX);

          // Odd-ratio comparison relative to first bell displacement
          const firstDx = this.galileoChimes.length > 0 ? this.galileoChimes[0].dx : dx;
          const ratioNum = firstDx > 0.01 ? (dx / firstDx).toFixed(1) : '1.0';
          const stepRatio = firstDx > 0.01 ? (stepDx / firstDx).toFixed(1) : '1.0';
          const waterGrains = Math.round(bell.chimeTime * 18.2);

          const chimeRecord = {
            id: bell.id,
            note: bell.note,
            x: bell.x,
            dx: dx,
            stepDx: stepDx,
            stepRatio: stepRatio,
            t: bell.chimeTime,
            dt: dt,
            waterGrains: waterGrains,
            ratio: `${ratioNum}×`
          };
          this.galileoChimes.push(chimeRecord);

          // Flash active fret card
          if (this.fretCards && this.fretCards[i]) {
            this.fretCards[i].classList.add('active-rung');
            setTimeout(() => {
              if (this.fretCards[i]) this.fretCards[i].classList.remove('active-rung');
            }, 600);
          }

          this.updateGalileoChimeTable();
        }
      }
    }

    // Ticker marks
    if (this.showTickerMarks && this.currentTime - this.lastTickerTime >= this.tickerInterval) {
      this.tickerMarks.push({ x: this.currentX, t: this.currentTime });
      this.lastTickerTime = this.currentTime;
    }

    // Photogates check
    if (this.labMode === 'photogate') {
      this.checkPhotogates();
    }
  }

  flashMetronomeLed() {
    if (!this.metronomeLed) return;
    this.metronomeLed.classList.add('flash');
    setTimeout(() => {
      this.metronomeLed.classList.remove('flash');
    }, 180);
  }

  recordMetronomeMark() {
    if (!this.isRunning && this.currentTime === 0) {
      this.startSimulation();
      return;
    }

    const targetBeat = Math.max(1, Math.round(this.currentTime / this.metronomeInterval));
    const beatTime = targetBeat * this.metronomeInterval;

    const actualX = positionAtTime(beatTime, this.x0, this.v0, this.currentA);
    const reactionLatency = (Math.random() - 0.5) * 0.12;
    const studentMarkedX = Math.max(this.x0, Math.min(this.trackLength, positionAtTime(beatTime + reactionLatency, this.x0, this.v0, this.currentA)));

    this.markedBeats.set(targetBeat, {
      beat: targetBeat,
      t: beatTime,
      x: parseFloat(studentMarkedX.toFixed(3)),
      actualX: parseFloat(actualX.toFixed(3))
    });

    const vInst = velocityAtTime(beatTime, this.v0, this.currentA);
    this.addRecordPoint(beatTime, studentMarkedX, vInst, this.labMode);

    this.showToast(`🖊 Marked Beat #${targetBeat} (${beatTime.toFixed(1)}s) at ${studentMarkedX.toFixed(2)} m`);
  }

  handleTrackClick(pixelX) {
    const padX = 60;
    const w = this.canvasApp.clientWidth;
    const h = this.canvasApp.clientHeight;
    const benchY = h - 35;
    const topMargin = 72;
    const maxRise = benchY - topMargin;
    const angleRad = (this.angleDeg * Math.PI) / 180;
    const sinAngle = Math.sin(angleRad);
    const availW = w - padX * 2;
    const trackPixelLength = Math.min(availW, maxRise / sinAngle);

    const fraction = (pixelX - padX) / trackPixelLength;
    if (fraction >= 0 && fraction <= 1) {
      const clickedX = fraction * this.trackLength;
      this.recordManualMarkAtPosition(clickedX);
    }
  }

  recordManualMarkAtPosition(clickedX) {
    const targetBeat = Math.max(1, Math.round(this.currentTime / this.metronomeInterval));
    const beatTime = targetBeat * this.metronomeInterval;
    const vInst = velocityAtTime(beatTime, this.v0, this.currentA);

    this.markedBeats.set(targetBeat, {
      beat: targetBeat,
      t: beatTime,
      x: parseFloat(clickedX.toFixed(3)),
      actualX: parseFloat(this.currentX.toFixed(3))
    });

    this.addRecordPoint(beatTime, clickedX, vInst, this.labMode);
    this.showToast(`🖊 Marked on track: Beat #${targetBeat} at ${clickedX.toFixed(2)} m`);
  }

  getTrackCoordsFromEvent(e) {
    const rect = this.canvasApp.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const padX = 60;
    const w = this.canvasApp.clientWidth;
    const h = this.canvasApp.clientHeight;
    const benchY = h - 35;
    const topMargin = 72;
    const maxRise = benchY - topMargin;
    const angleRad = (this.angleDeg * Math.PI) / 180;
    const sinAngle = Math.sin(angleRad);
    const cosAngle = Math.cos(angleRad);
    const availW = w - padX * 2;
    const trackPixelLength = Math.min(availW, maxRise / sinAngle);

    const originX = padX;
    const originY = benchY - sinAngle * trackPixelLength;

    const dx = mouseX - originX;
    const dy = mouseY - originY;

    // In track coordinate frame: trackX along track, trackY perpendicular down
    const trackX = dx * cosAngle + dy * sinAngle;
    const trackY = -dx * sinAngle + dy * cosAngle;

    const fraction = trackX / trackPixelLength;
    const metersX = fraction * this.trackLength;

    return {
      mouseX,
      mouseY,
      trackX,
      trackY,
      trackPixelLength,
      fraction,
      metersX
    };
  }

  findBellAtCoords(coords) {
    if (this.labMode !== 'galileo') return null;
    const { trackX, trackY, trackPixelLength } = coords;
    // Bell bracket extends between trackY = -60 and trackY = 25
    if (trackY < -60 || trackY > 25) return null;

    for (const bell of this.galileoBells) {
      const bellPx = (bell.x / this.trackLength) * trackPixelLength;
      if (Math.abs(trackX - bellPx) <= 16) {
        return bell;
      }
    }
    return null;
  }

  handleCanvasPointerDown(e) {
    if (this.labMode !== 'galileo') return;
    const coords = this.getTrackCoordsFromEvent(e);
    const hitBell = this.findBellAtCoords(coords);
    if (hitBell) {
      this.draggingBell = hitBell;
      this.hoveredBell = hitBell;
      this.canvasApp.style.cursor = 'grabbing';
      if (this.canvasApp.setPointerCapture && e.pointerId !== undefined) {
        try { this.canvasApp.setPointerCapture(e.pointerId); } catch (_) {}
      }
      this.renderApparatus();
    }
  }

  handleCanvasPointerMove(e) {
    if (this.labMode !== 'galileo') return;
    const coords = this.getTrackCoordsFromEvent(e);

    if (this.draggingBell) {
      let newX = Math.round(coords.metersX * 100) / 100;
      // Clamp between 0.18m and trackLength (2.40m)
      newX = Math.max(0.18, Math.min(this.trackLength, newX));
      this.draggingBell.x = newX;
      this.updateGalileoBellUI();
      if (!this.isRunning) {
        this.resetSimulation();
      }
      this.renderApparatus();
    } else {
      const hitBell = this.findBellAtCoords(coords);
      if (hitBell !== this.hoveredBell) {
        this.hoveredBell = hitBell;
        this.canvasApp.style.cursor = hitBell ? 'ew-resize' : 'default';
        this.renderApparatus();
      }
    }
  }

  handleCanvasPointerUp(e) {
    if (this.draggingBell) {
      if (this.canvasApp.releasePointerCapture && e.pointerId !== undefined) {
        try { this.canvasApp.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      this.draggingBell = null;
      this.canvasApp.style.cursor = this.hoveredBell ? 'ew-resize' : 'default';
      this.renderApparatus();
    }
  }

  updateGalileoBellUI() {
    this.galileoBells.forEach((bell, idx) => {
      const slider = this.fretSliders[idx];
      const valSpan = this.fretVals[idx];
      const distSpan = this.fretDists[idx];
      if (slider) slider.value = bell.x;
      if (valSpan) valSpan.textContent = `${bell.x.toFixed(2)} m`;
      if (distSpan) {
        const dx = Math.max(0, bell.x - this.x0);
        const baseDx = Math.max(0.01, this.galileoBells[0].x - this.x0);
        const ratio = idx === 0 ? '1.0' : (dx / baseDx).toFixed(1);
        distSpan.textContent = `Δx = ${dx.toFixed(2)} m (${ratio}×)`;
      }
    });
  }

  applyGalileoPreset(type) {
    if (type === 'odd') {
      // 1 : 4 : 9 : 16 : 25 spacing relative to start x0 = 0.16m
      const unit = 0.09;
      const positions = [
        0.16 + 1 * unit,   // 0.25 m
        0.16 + 4 * unit,   // 0.52 m
        0.16 + 9 * unit,   // 0.97 m
        0.16 + 16 * unit,  // 1.60 m
        0.16 + 25 * unit   // 2.41 -> 2.40 m
      ];
      this.galileoBells.forEach((bell, idx) => {
        bell.x = Math.min(this.trackLength, parseFloat(positions[idx].toFixed(2)));
      });
      this.showToast("🎵 Set Galileo's Odd-Number Rule (1 : 4 : 9 : 16 : 25) for equal musical cadence!");
    } else if (type === 'equal_dist') {
      // Equal distance intervals (accelerating beats)
      const positions = [0.50, 0.95, 1.40, 1.85, 2.30];
      this.galileoBells.forEach((bell, idx) => {
        bell.x = positions[idx];
      });
      this.showToast("📏 Set Equal Distance Spacing: Listen to how the tempo accelerates!");
    } else if (type === 'scramble') {
      const randomPositions = [
        parseFloat((0.24 + Math.random() * 0.18).toFixed(2)),
        parseFloat((0.50 + Math.random() * 0.22).toFixed(2)),
        parseFloat((0.90 + Math.random() * 0.25).toFixed(2)),
        parseFloat((1.35 + Math.random() * 0.30).toFixed(2)),
        parseFloat((1.90 + Math.random() * 0.35).toFixed(2))
      ];
      this.galileoBells.forEach((bell, idx) => {
        bell.x = Math.min(this.trackLength, randomPositions[idx]);
      });
      this.showToast("🎲 Scrambled frets! Try tuning them to make the tempo steady.");
    }

    this.updateGalileoBellUI();
    this.resetSimulation();
    this.renderAll();
  }

  updateGalileoChimeTable() {
    if (!this.tbodyGalileoChimes) return;
    if (this.galileoChimes.length === 0) {
      this.tbodyGalileoChimes.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--subtle); padding: 0.85rem;">
            Start motion to roll the bronze sphere and record the bell chime beats.
          </td>
        </tr>
      `;
      if (this.verdictGalileoTempo) {
        this.verdictGalileoTempo.className = 'cadence-badge';
        this.verdictGalileoTempo.innerHTML = '⏳ Release the bronze sphere to hear the chime cadence &amp; observe the water balance';
      }
      return;
    }

    let rows = '';
    const dts = [];
    for (let i = 0; i < this.galileoChimes.length; i++) {
      const c = this.galileoChimes[i];
      if (i > 0) dts.push(c.dt);

      let cadenceLabel = '<span style="color: #0f7e9b; font-weight: 600;">First Strike (Reference)</span>';
      if (i > 0) {
        const prevDt = this.galileoChimes[i - 1].dt;
        if (i === 1) {
          cadenceLabel = '<span>Beat #2</span>';
        } else if (Math.abs(c.dt - prevDt) <= 0.08) {
          cadenceLabel = '<span style="color: #2b7a4b; font-weight: 600;">● Steady Beat 🎵</span>';
        } else if (c.dt < prevDt - 0.05) {
          cadenceLabel = '<span style="color: #d67b19; font-weight: 600;">⚡ Accelerated</span>';
        } else {
          cadenceLabel = '<span style="color: #666;">Irregular</span>';
        }
      }

      rows += `
        <tr>
          <td style="font-weight: 700; color: #5c3a1e;">#${c.id}</td>
          <td><span class="fret-badge">${c.note}</span></td>
          <td style="font-family: monospace; font-weight: 600;">${c.x.toFixed(2)} m</td>
          <td style="font-family: monospace;">${c.dx.toFixed(2)} m</td>
          <td style="font-family: monospace; color: #6d4b29;">${c.stepDx.toFixed(2)} m <small>(${c.stepRatio}×)</small></td>
          <td><span style="font-weight: 700; color: #0f7e9b;">${c.ratio}</span></td>
          <td style="font-family: monospace; font-weight: 600; color: #5c3a1e;">💧 ${c.waterGrains} grains</td>
          <td>${cadenceLabel}</td>
        </tr>
      `;
    }
    this.tbodyGalileoChimes.innerHTML = rows;

    // Assess tempo rhythm
    if (this.verdictGalileoTempo) {
      if (dts.length === 0) {
        this.verdictGalileoTempo.className = 'cadence-badge';
        this.verdictGalileoTempo.innerHTML = `🔔 Fret 1 struck (${this.galileoChimes[0].waterGrains} grains of water weighed). Roll continuing...`;
      } else {
        const avg = dts.reduce((a, b) => a + b, 0) / dts.length;
        const maxDiff = Math.max(...dts.map(d => Math.abs(d - avg)));
        const isDecreasing = dts.every((d, idx) => idx === 0 || d < dts[idx - 1] - 0.04);

        if (maxDiff <= 0.08) {
          this.verdictGalileoTempo.className = 'cadence-badge steady';
          this.verdictGalileoTempo.innerHTML = `🎶 <strong>Steady Musical Isochronism!</strong> The bells strike in equal, regular rhythm. Galileo proved this produces distance ratios 1 : 4 : 9 : 16 : 25 and water weights 1 : 2 : 3 : 4 : 5!`;
        } else if (isDecreasing) {
          this.verdictGalileoTempo.className = 'cadence-badge accelerating';
          this.verdictGalileoTempo.innerHTML = `⚡ <strong>Accelerating Gallop!</strong> Intervals between bells shorten as the sphere rolls faster. Equal spatial distances do not yield equal musical time!`;
        } else {
          this.verdictGalileoTempo.className = 'cadence-badge';
          this.verdictGalileoTempo.innerHTML = `🎼 <strong>Unequal Cadence:</strong> Intervals between frets are irregular. Slide the frets to match odd numbers 1 : 3 : 5 : 7 : 9 to tune an isochronous rhythm!`;
        }
      }
    }
  }

  transferGalileoData() {
    if (this.galileoChimes.length === 0) {
      this.showToast('⚠️ No bell chime points recorded yet. Press Start Motion first!');
      return;
    }
    this.clearData();
    this.addRecordPoint(0.00, this.x0, 0.00, 'galileo');
    for (const c of this.galileoChimes) {
      const v = velocityAtTime(c.t, this.v0, this.currentA);
      this.addRecordPoint(c.t, c.x, v, 'galileo');
    }
    this.recomputeModels();
    this.updateTablesUI();
    this.renderGraphs();
    this.showToast('📥 Transferred chime points to the main data table and graphs!');
  }

  autoDropCurrentMarks() {
    this.clearData();
    const a = this.currentA;
    const totalBeats = Math.floor(Math.sqrt((2 * (this.trackLength - this.x0)) / a));

    for (let b = 0; b <= totalBeats; b++) {
      const t = b * this.metronomeInterval;
      const x = positionAtTime(t, this.x0, 0, a);
      if (x <= this.trackLength) {
        const v = velocityAtTime(t, 0, a);
        this.markedBeats.set(b, { beat: b, t, x, actualX: x });
        this.addRecordPoint(t, x, v, this.labMode);
      }
    }
    this.showToast('✅ Exact 1-second marks loaded (front of cart)');
  }

  checkPhotogates() {
    for (const gatePos of this.photogates) {
      if (!this.passedGates.has(gatePos) && this.currentX >= gatePos) {
        this.passedGates.add(gatePos);
        this.gateFlashMap.set(gatePos, 0.4);

        const exactTime = timeAtPosition(gatePos, this.x0, this.v0, this.currentA) || this.currentTime;
        const vInst = velocityAtTime(exactTime, this.v0, this.currentA);

        this.addRecordPoint(exactTime, gatePos, vInst, 'auto');
      }
    }
  }

  recordManualSplit() {
    if (!this.isRunning && this.currentTime === 0) {
      this.startSimulation();
      return;
    }

    const scatterTime = addReactionTimeJitter(this.currentTime, 0.16);
    const recordedX = Math.round(this.currentX * 100) / 100;
    const vInst = velocityAtTime(this.currentTime, this.v0, this.currentA);

    this.addRecordPoint(scatterTime, recordedX, vInst, 'manual');
    this.showToast(`⏱ Split logged: ${scatterTime.toFixed(2)} s at ${recordedX.toFixed(2)} m`);
  }

  addRecordPoint(t, x, vInstant, method) {
    const existingIdx = this.recordedPoints.findIndex(p => Math.abs(p.t - t) < 0.05);
    if (existingIdx !== -1) {
      this.recordedPoints[existingIdx] = {
        id: this.recordedPoints[existingIdx].id,
        t: parseFloat(t.toFixed(3)),
        x: parseFloat(x.toFixed(3)),
        vInstant: parseFloat(vInstant.toFixed(3)),
        method
      };
    } else {
      this.recordedPoints.push({
        id: Date.now() + Math.random(),
        t: parseFloat(t.toFixed(3)),
        x: parseFloat(x.toFixed(3)),
        vInstant: parseFloat(vInstant.toFixed(3)),
        method
      });
    }

    this.recordedPoints.sort((a, b) => a.t - b.t);

    this.recomputeModels();
    this.updateTablesUI();
    this.renderGraphs();
  }

  clearData() {
    this.recordedPoints = [];
    this.markedBeats.clear();
    this.passedGates.clear();
    for (const bell of this.galileoBells) {
      bell.rung = false;
      bell.chimeTime = null;
    }
    this.galileoChimes = [];
    this.bellRipples = [];
    this.updateGalileoChimeTable();
    this.recomputeModels();
    this.updateTablesUI();
    this.renderGraphs();
    this.showToast('🗑 Data cleared');
  }

  loadSampleData() {
    this.clearData();
    const a = calculateInclineAcceleration(this.angleDeg, this.muFriction);
    const times = [0.0, 1.0, 2.0, 3.0, 4.0];

    times.forEach((t, idx) => {
      const x = positionAtTime(t, this.x0, 0, a);
      if (x <= this.trackLength) {
        const v = velocityAtTime(t, 0, a);
        this.markedBeats.set(idx, { beat: idx, t, x, actualX: x });
        this.addRecordPoint(t, x, v, this.labMode);
      }
    });

    this.showToast('✅ Sample 1-Second Metronome Data Loaded (x₀ = 0.16m)');
  }

  recomputeModels() {
    if (this.recordedPoints.length >= 3) {
      const quadInput = this.recordedPoints.map(p => ({ x: p.t, y: p.x }));
      this.quadFit = quadraticRegression(quadInput);
    } else {
      this.quadFit = null;
    }

    if (this.quadFit && this.quadFit.valid) {
      this.instantaneousVelocities = this.recordedPoints.map(p => {
        const tangent = calculateTangent(this.quadFit, p.t);
        return {
          t: p.t,
          x: p.x,
          v: parseFloat(tangent.slope.toFixed(3))
        };
      });

      const linInput = this.instantaneousVelocities.map(p => ({ x: p.t, y: p.v }));
      this.linearFit = linearRegression(linInput);

      const maxT = Math.max(...this.recordedPoints.map(p => p.t));
      this.sliderTangent.max = maxT.toFixed(2);
      if (this.scrubTime > maxT || this.scrubTime === 0) {
        this.scrubTime = parseFloat((maxT / 2).toFixed(2));
        this.sliderTangent.value = this.scrubTime;
      }
      this.updateTangentUI();
    } else {
      this.instantaneousVelocities = [];
      this.linearFit = null;
    }

    this.updateAnalysisCards();
  }

  updateTangentUI() {
    this.valTangentTime.textContent = `${this.scrubTime.toFixed(2)} s`;
    if (this.quadFit && this.quadFit.valid) {
      const tangent = calculateTangent(this.quadFit, this.scrubTime);
      this.valTangentSlope.textContent = `${tangent.slope >= 0 ? '+' : ''}${tangent.slope.toFixed(2)} m/s`;
    } else {
      this.valTangentSlope.textContent = '-- m/s';
    }
  }

  updateReadouts() {
    // Modern readouts
    if (this.metricTime) this.metricTime.textContent = `${this.currentTime.toFixed(2)} s`;
    if (this.metricPos) this.metricPos.textContent = `${this.currentX.toFixed(2)} m`;
    if (this.metricVel) this.metricVel.textContent = `${this.currentV.toFixed(2)} m/s`;
    if (this.metricAcc) this.metricAcc.textContent = `${this.currentA.toFixed(2)} m/s²`;
    if (this.metricAngle) this.metricAngle.textContent = `${this.angleDeg.toFixed(1)}°`;

    // Galileo Renaissance readouts
    if (this.metricGalileoAngle) this.metricGalileoAngle.textContent = `${this.angleDeg.toFixed(1)}°`;
    if (this.metricGalileoPos) this.metricGalileoPos.textContent = `${this.currentX.toFixed(2)} m`;

    const grainsOfWater = Math.round(this.currentTime * 18.2);
    if (this.metricGalileoWater) {
      this.metricGalileoWater.textContent = `${grainsOfWater} grains`;
    }

    const rungCount = this.galileoBells.filter(b => b.rung).length;
    if (this.metricGalileoBells) {
      this.metricGalileoBells.textContent = `${rungCount} of 5`;
    }

    if (this.metricGalileoCadence) {
      if (rungCount === 0) {
        this.metricGalileoCadence.textContent = 'Ready';
      } else if (rungCount < 5) {
        this.metricGalileoCadence.textContent = `Chiming (${rungCount}/5)`;
      } else {
        const dts = [];
        for (let i = 1; i < this.galileoChimes.length; i++) {
          dts.push(this.galileoChimes[i].dt);
        }
        if (dts.length >= 2) {
          const avg = dts.reduce((a, b) => a + b, 0) / dts.length;
          const maxDiff = Math.max(...dts.map(d => Math.abs(d - avg)));
          const isDecreasing = dts.every((d, idx) => idx === 0 || d < dts[idx - 1] - 0.04);
          if (maxDiff <= 0.08) {
            this.metricGalileoCadence.textContent = 'Steady Beat 🎵';
          } else if (isDecreasing) {
            this.metricGalileoCadence.textContent = 'Accelerating Gallop ⚡';
          } else {
            this.metricGalileoCadence.textContent = 'Irregular Tempo 🎼';
          }
        } else {
          this.metricGalileoCadence.textContent = 'Complete';
        }
      }
    }
  }

  updateTablesUI() {
    if (this.recordedPoints.length === 0) {
      this.tbodyData.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--subtle); padding: 1.5rem;">No data collected yet. Start the cart or click 'Sample Data'.</td></tr>`;
    } else {
      this.tbodyData.innerHTML = this.recordedPoints.map((p, idx) => `
        <tr class="${Math.abs(p.t - this.scrubTime) < 0.08 ? 'active-row' : ''}">
          <td style="font-weight: 600; color: var(--primary-teal);">${idx + 1}</td>
          <td>${p.t.toFixed(2)}</td>
          <td><strong>${p.x.toFixed(3)}</strong></td>
        </tr>
      `).join('');
    }

    if (this.instantaneousVelocities.length === 0) {
      this.tbodyVel.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--subtle); padding: 1.5rem;">Need at least 3 points to calculate tangent velocities.</td></tr>`;
    } else {
      this.tbodyVel.innerHTML = this.instantaneousVelocities.map((item, idx) => `
        <tr>
          <td style="font-weight: 600; color: var(--accent-amber-dark);">${idx + 1}</td>
          <td>${item.t.toFixed(2)}</td>
          <td><strong>${item.v.toFixed(3)}</strong></td>
        </tr>
      `).join('');
    }

    if (this.quadFit && this.quadFit.valid) {
      const { a, b, c, r2 } = this.quadFit;
      const signB = b >= 0 ? '+' : '-';
      const signC = c >= 0 ? '+' : '-';
      this.badgeQuadFit.innerHTML = `
        <span class="math-expr">
          <b><i>x</i>(<i>t</i>)</b> = <b>${a.toFixed(3)}</b>·<i>t</i>² ${signB} <b>${Math.abs(b).toFixed(3)}</b>·<i>t</i> ${signC} <b>${Math.abs(c).toFixed(3)}</b>
        </span>
        <span style="font-weight: 700;">R² = ${r2.toFixed(4)}</span>
      `;
    } else {
      this.badgeQuadFit.innerHTML = `<span>Fit requires ≥ 3 data points</span><span>R² = --</span>`;
    }

    if (this.linearFit && this.linearFit.n >= 2) {
      const { slope, intercept, r2 } = this.linearFit;
      const signB = intercept >= 0 ? '+' : '-';
      this.badgeLinearFit.innerHTML = `
        <span class="math-expr">
          <b><i>v</i>(<i>t</i>)</b> = <b>${slope.toFixed(3)}</b>·<i>t</i> ${signB} <b>${Math.abs(intercept).toFixed(3)}</b>
        </span>
        <span style="font-weight: 700;">R² = ${r2.toFixed(4)}</span>
      `;
    } else {
      this.badgeLinearFit.innerHTML = `<span>Fit requires tangent velocities</span><span>R² = --</span>`;
    }
  }

  updateAnalysisCards() {
    if (this.quadFit && this.quadFit.valid && this.linearFit) {
      const A = this.quadFit.a;
      const B = this.quadFit.b;
      const C = this.quadFit.c;
      const m = this.linearFit.slope;
      const b = this.linearFit.intercept;

      const signB = B >= 0 ? '+' : '-';
      const signC = C >= 0 ? '+' : '-';
      const signb = b >= 0 ? '+' : '-';

      this.mathModelEqPos.innerHTML = `
        <span class="math-expr">
          <i>x</i>(<i>t</i>) = (<b>${A.toFixed(3)}</b> m/s²) · <i>t</i>² ${signB} (<b>${Math.abs(B).toFixed(3)}</b> m/s) · <i>t</i> ${signC} (<b>${Math.abs(C).toFixed(3)}</b> m)
        </span>
      `;

      this.mathModelEqVel.innerHTML = `
        <span class="math-expr">
          <i>v</i>(<i>t</i>) = (<b>${m.toFixed(3)}</b> m/s²) · <i>t</i> ${signb} (<b>${Math.abs(b).toFixed(3)}</b> m/s)
        </span>
      `;

      this.cmpCoeffA.innerHTML = `<b>${A.toFixed(3)}</b> m/s²`;
      this.cmpSlopeM.innerHTML = `<b>${m.toFixed(3)}</b> m/s² <br><small style="color: var(--success); font-weight: 700;">(½ × ${m.toFixed(3)} = ${(m / 2).toFixed(3)})</small>`;
      this.cmpCoeffB.innerHTML = `<b>${B.toFixed(3)}</b> m/s`;
      this.cmpInterceptB.innerHTML = `<b>${b.toFixed(3)}</b> m/s`;
    } else {
      this.mathModelEqPos.innerHTML = `<span style="color: var(--subtle); font-size: 0.9rem;">Collect at least 3 data points to generate position equation...</span>`;
      this.mathModelEqVel.innerHTML = `<span style="color: var(--subtle); font-size: 0.9rem;">Velocity model will appear here...</span>`;
      this.cmpCoeffA.textContent = '--';
      this.cmpSlopeM.textContent = '--';
      this.cmpCoeffB.textContent = '--';
      this.cmpInterceptB.textContent = '--';
    }
  }

  // Canvas Rendering
  renderAll() {
    this.renderApparatus();
    this.renderGraphs();
  }

  renderApparatus() {
    const ctx = this.ctxApp;
    const w = this.canvasApp.clientWidth;
    const h = this.canvasApp.clientHeight;

    ctx.clearRect(0, 0, w, h);

    const isGalileo = this.labMode === 'galileo';

    // Bench / Table Surface
    const benchY = h - 35;
    ctx.fillStyle = isGalileo ? '#f3ebde' : '#f0f6fa';
    ctx.fillRect(0, benchY, w, 35);
    ctx.strokeStyle = isGalileo ? '#d2c2ad' : '#c8dbe3';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, benchY);
    ctx.lineTo(w, benchY);
    ctx.stroke();

    // DYNAMIC GEOMETRY FIX:
    // Ensure that even at 15° (steepest incline), the top of the ramp NEVER clips!
    // Top margin of 72px gives full clearance for cart body, wheels, sensor flag, and vectors.
    const padX = 60;
    const topMargin = 72;
    const maxRise = benchY - topMargin;
    const angleRad = (this.angleDeg * Math.PI) / 180;
    const sinAngle = Math.sin(angleRad);
    const cosAngle = Math.cos(angleRad);

    const availW = w - padX * 2;
    const trackPixelLength = Math.min(availW, maxRise / sinAngle);

    const startX = padX;
    const startY = benchY - sinAngle * trackPixelLength;
    const endX = padX + cosAngle * trackPixelLength;
    const endY = benchY;

    // Support Stand / Block
    const blockWidth = 24;
    const blockHeight = benchY - startY;
    if (blockHeight > 0) {
      ctx.fillStyle = isGalileo ? '#d4b896' : '#d4e5ee';
      ctx.strokeStyle = isGalileo ? '#8c6239' : '#9ab9c8';
      drawRoundedRect(ctx, startX - blockWidth / 2, startY, blockWidth, blockHeight, 4);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = isGalileo ? '#a0784d' : '#82a5b6';
      for (let y = startY + 8; y < benchY; y += 12) {
        ctx.beginPath();
        ctx.moveTo(startX - blockWidth / 2 + 4, y);
        ctx.lineTo(startX + blockWidth / 2 - 4, y);
        ctx.stroke();
      }
    }

    // Track Beam
    ctx.save();
    ctx.translate(startX, startY);
    ctx.rotate(angleRad);

    const trackThick = 14;
    if (isGalileo) {
      // Renaissance polished wooden moulding with bronze groove
      ctx.fillStyle = '#b87b46';
      ctx.strokeStyle = '#6e421a';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, -10, 0, trackPixelLength + 20, trackThick, 3);
      ctx.fill();
      ctx.stroke();

      // Bronze groove channel
      ctx.fillStyle = '#7a4f22';
      ctx.fillRect(0, 0, trackPixelLength, 4);
    } else {
      // Modern aluminum dynamics track
      ctx.fillStyle = '#e2ecf2';
      ctx.strokeStyle = '#0f7e9b';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, -10, 0, trackPixelLength + 20, trackThick, 3);
      ctx.fill();
      ctx.stroke();
    }

    // Metric Ruler Markings
    ctx.fillStyle = isGalileo ? '#5c3a1e' : '#123140';
    ctx.font = '9px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 1;
    ctx.strokeStyle = isGalileo ? '#9b714b' : '#7a94a0';

    const numMarks = 12;
    for (let i = 0; i <= numMarks; i++) {
      const frac = i / numMarks;
      const meterVal = frac * this.trackLength;
      const px = frac * trackPixelLength;

      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, i % 2 === 0 ? -9 : -5);
      ctx.stroke();

      if (i % 2 === 0) {
        ctx.fillText(`${meterVal.toFixed(1)}m`, px, -12);
      }
    }

    // Render Photogates (in Photogate mode)
    if (this.labMode === 'photogate') {
      for (const gatePos of this.photogates) {
        const gateFrac = gatePos / this.trackLength;
        const gatePx = gateFrac * trackPixelLength;
        const isPassed = this.passedGates.has(gatePos);

        ctx.fillStyle = isPassed ? '#1a7f4e' : '#0f7e9b';
        ctx.strokeStyle = '#095f76';
        drawRoundedRect(ctx, gatePx - 5, -34, 10, 34, 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isPassed ? '#22c55e' : '#d67b19';
        ctx.beginPath();
        ctx.arc(gatePx, -26, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Render Galileo Brass Bells & Gut Frets (in Galileo mode)
    if (isGalileo) {
      const now = performance.now();
      this.bellRipples = this.bellRipples.filter(r => now - r.startTime < r.duration);

      for (const bell of this.galileoBells) {
        const bellPx = (bell.x / this.trackLength) * trackPixelLength;
        const isHovered = (this.hoveredBell === bell || this.draggingBell === bell);

        // Gut fret wire across track in deep gut brown
        ctx.strokeStyle = '#5c3a1e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(bellPx, -2);
        ctx.lineTo(bellPx, trackThick);
        ctx.stroke();

        // Small gut knots at track top and bottom edges
        ctx.fillStyle = '#422812';
        ctx.beginPath();
        ctx.arc(bellPx, -2, 2, 0, Math.PI * 2);
        ctx.arc(bellPx, trackThick, 2, 0, Math.PI * 2);
        ctx.fill();

        // Antique arched brass bracket rising from track
        ctx.strokeStyle = isHovered ? '#d67b19' : '#8a6125';
        ctx.lineWidth = isHovered ? 2.5 : 2.0;
        ctx.beginPath();
        ctx.moveTo(bellPx, 0);
        ctx.lineTo(bellPx, -34);
        ctx.stroke();

        // Bell bracket cross-hanger arch
        ctx.beginPath();
        ctx.moveTo(bellPx - 6, -34);
        ctx.lineTo(bellPx + 6, -34);
        ctx.stroke();

        // Hover / Drag Glow Aura
        if (isHovered) {
          ctx.fillStyle = 'rgba(214, 123, 25, 0.22)';
          ctx.beginPath();
          ctx.arc(bellPx, -25, 14, 0, Math.PI * 2);
          ctx.fill();

          // Guide line down to track/ruler
          ctx.strokeStyle = '#d67b19';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(bellPx, trackThick);
          ctx.lineTo(bellPx, trackThick + 22);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Active sound ripples if recently rung
        for (const ripple of this.bellRipples) {
          if (ripple.x === bell.x) {
            const progress = (now - ripple.startTime) / ripple.duration;
            const ripRadius = 8 + progress * 24;
            ctx.strokeStyle = `rgba(214, 123, 25, ${1 - progress})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(bellPx, -24, ripRadius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // Brass Bell Body (Flared Renaissance bell geometry)
        ctx.fillStyle = bell.rung ? '#d67b19' : (isHovered ? '#e29c42' : '#c99642');
        ctx.strokeStyle = '#6e4918';
        ctx.lineWidth = 1.2;

        ctx.beginPath();
        // Top crown of bell
        ctx.moveTo(bellPx - 3, -32);
        ctx.lineTo(bellPx + 3, -32);
        // Flared sides down to sound lip
        ctx.quadraticCurveTo(bellPx + 4, -26, bellPx + 7, -20);
        ctx.lineTo(bellPx - 7, -20);
        ctx.quadraticCurveTo(bellPx - 4, -26, bellPx - 3, -32);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Bell Clapper bead hanging beneath lip
        ctx.fillStyle = '#4a2f0e';
        ctx.beginPath();
        ctx.arc(bellPx, -18, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Bell Handle Loop / Drag Ring at top of bracket
        ctx.strokeStyle = isHovered ? '#d67b19' : '#a0784d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bellPx, -37, 3.5, 0, Math.PI * 2);
        ctx.stroke();

        // Bell Label Badge
        if (isHovered) {
          const badgeText = `🔔 Fret ${bell.id}: ${bell.x.toFixed(2)}m (drag ↔)`;
          ctx.font = 'bold 9px "Inter", sans-serif';
          const txtW = ctx.measureText(badgeText).width;
          ctx.fillStyle = '#d67b19';
          drawRoundedRect(ctx, bellPx - txtW / 2 - 4, -54, txtW + 8, 14, 3);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(badgeText, bellPx, -44);
        } else {
          ctx.font = 'bold 8.5px "Inter", sans-serif';
          ctx.fillStyle = '#5c3a1e';
          ctx.fillText(`Fret ${bell.id} (${bell.x.toFixed(2)}m)`, bellPx, -42);
        }
      }
    }

    // Render Metronome Dry-Erase Position Marks on the track
    if (this.labMode === 'metronome') {
      for (const [beatNum, mark] of this.markedBeats) {
        const markPx = (mark.x / this.trackLength) * trackPixelLength;

        ctx.fillStyle = beatNum === 0 ? '#0f7e9b' : '#d67b19';
        ctx.strokeStyle = beatNum === 0 ? '#095f76' : '#b86510';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(markPx, -28);
        ctx.lineTo(markPx, trackThick);
        ctx.stroke();

        const flagText = beatNum === 0 ? `Front (0s): ${mark.x.toFixed(2)}m` : `#${beatNum}: ${mark.t.toFixed(0)}s (${mark.x.toFixed(2)}m)`;
        ctx.font = 'bold 9px "Inter", sans-serif';
        const txtWidth = ctx.measureText(flagText).width;

        drawRoundedRect(ctx, markPx - txtWidth / 2 - 4, -44, txtWidth + 8, 14, 3);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(flagText, markPx, -34);
      }
    }

    // FRONT BUMPER TRACKING:
    // The front of the cart/sphere is at currentX!
    // The back is at currentX - cartLengthMeters!
    const frontPx = (this.currentX / this.trackLength) * trackPixelLength;
    const cartPixelW = (this.cartLengthMeters / this.trackLength) * trackPixelLength;
    const backPx = frontPx - cartPixelW;

    if (isGalileo) {
      // Galileo's polished bronze sphere
      const sphereR = 9; // radius
      const sphereCenterPx = frontPx - sphereR;

      // Bronze sphere with rotation
      const rotAngle = (this.currentX / 0.04) % (Math.PI * 2);
      ctx.save();
      ctx.translate(sphereCenterPx, -sphereR);
      ctx.rotate(rotAngle);

      ctx.fillStyle = '#b87b46';
      ctx.strokeStyle = '#5a3b1a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, sphereR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Metallic gleam & engraved line
      ctx.strokeStyle = '#e6bf8b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-sphereR + 3, 0);
      ctx.lineTo(sphereR - 3, 0);
      ctx.stroke();

      ctx.restore();

      // Front Indicator Pointer
      ctx.fillStyle = '#d67b19';
      ctx.beginPath();
      ctx.moveTo(frontPx, -sphereR * 2 - 10);
      ctx.lineTo(frontPx - 4, -sphereR * 2 - 16);
      ctx.lineTo(frontPx + 4, -sphereR * 2 - 16);
      ctx.closePath();
      ctx.fill();

      ctx.font = 'bold 9px "Inter", sans-serif';
      ctx.fillText(`Front: ${this.currentX.toFixed(2)}m`, frontPx, -sphereR * 2 - 20);
    } else {
      // Modern Dynamics Cart
      const cartH = 18;
      const wheelR = 5;

      const wheelAngle = (this.currentX / 0.05) % (Math.PI * 2);
      ctx.fillStyle = '#123140';
      ctx.strokeStyle = '#7a94a0';
      ctx.lineWidth = 1.5;

      // Rear Wheel
      ctx.beginPath();
      ctx.arc(backPx + 10, -wheelR, wheelR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(backPx + 10, -wheelR);
      ctx.lineTo(backPx + 10 + Math.cos(wheelAngle) * wheelR, -wheelR + Math.sin(wheelAngle) * wheelR);
      ctx.stroke();

      // Front Wheel
      ctx.strokeStyle = '#7a94a0';
      ctx.beginPath();
      ctx.arc(frontPx - 10, -wheelR, wheelR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(frontPx - 10, -wheelR);
      ctx.lineTo(frontPx - 10 + Math.cos(wheelAngle) * wheelR, -wheelR + Math.sin(wheelAngle) * wheelR);
      ctx.stroke();

      // Cart Body (extends from backPx to frontPx)
      ctx.fillStyle = '#0f7e9b';
      ctx.strokeStyle = '#095f76';
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, backPx, -cartH - wheelR - 1, cartPixelW, cartH, 4);
      ctx.fill();
      ctx.stroke();

      // Sensor flag
      ctx.fillStyle = '#d67b19';
      drawRoundedRect(ctx, backPx + cartPixelW / 2 - 2, -cartH - wheelR - 14, 4, 14, 1);
      ctx.fill();

      // Front Bumper Highlight Indicator Line & Pointer
      ctx.fillStyle = '#d67b19';
      ctx.strokeStyle = '#b86510';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(frontPx, -cartH - wheelR - 1);
      ctx.lineTo(frontPx, 0);
      ctx.stroke();

      // Front Bumper label
      ctx.font = 'bold 9px "Inter", sans-serif';
      ctx.fillStyle = '#d67b19';
      ctx.fillText(`Front: ${this.currentX.toFixed(2)}m`, frontPx, -cartH - wheelR - 18);
    }

    // Vector Overlays
    if (this.showVectors) {
      if (this.currentV > 0.05) {
        const vLen = Math.min(80, this.currentV * 30);
        ctx.strokeStyle = '#d67b19';
        ctx.fillStyle = '#d67b19';
        ctx.lineWidth = 2.5;

        const arrowStartX = frontPx;
        const arrowStartY = -14;
        ctx.beginPath();
        ctx.moveTo(arrowStartX, arrowStartY);
        ctx.lineTo(arrowStartX + vLen, arrowStartY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(arrowStartX + vLen, arrowStartY);
        ctx.lineTo(arrowStartX + vLen - 6, arrowStartY - 4);
        ctx.lineTo(arrowStartX + vLen - 6, arrowStartY + 4);
        ctx.closePath();
        ctx.fill();

        ctx.font = '10px "Inter", sans-serif';
        ctx.fillText(`v = ${this.currentV.toFixed(2)} m/s`, arrowStartX + vLen / 2, arrowStartY - 6);
      }

      if (this.currentA > 0.05) {
        const aLen = Math.min(70, this.currentA * 24);
        ctx.strokeStyle = '#095f76';
        ctx.fillStyle = '#095f76';
        ctx.lineWidth = 2;

        const aStartX = backPx + cartPixelW / 2;
        const aStartY = -34;
        ctx.beginPath();
        ctx.moveTo(aStartX, aStartY);
        ctx.lineTo(aStartX + aLen, aStartY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(aStartX + aLen, aStartY);
        ctx.lineTo(aStartX + aLen - 5, aStartY - 3);
        ctx.lineTo(aStartX + aLen - 5, aStartY + 3);
        ctx.closePath();
        ctx.fill();

        ctx.font = '10px "Inter", sans-serif';
        ctx.fillText(`a = ${this.currentA.toFixed(2)} m/s²`, aStartX + aLen / 2, aStartY - 5);
      }
    }

    ctx.restore();

    // Incline Angle Arc
    ctx.strokeStyle = '#d67b19';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(endX, endY, 36, Math.PI - angleRad, Math.PI);
    ctx.stroke();

    ctx.fillStyle = '#b86510';
    ctx.font = 'bold 11px "Inter", sans-serif';
    ctx.fillText(`θ = ${this.angleDeg.toFixed(1)}°`, endX - 58, endY - 10);

    // Galileo Water Clock / Clepsydra Visual Indicator on bench
    if (isGalileo) {
      const waterGrams = (this.currentTime * 14.2).toFixed(1);
      ctx.fillStyle = '#6e421a';
      ctx.font = 'bold 10px "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`💧 Galileo's Clepsydra (Water Balance): ~${waterGrams} grains of water`, padX, benchY + 22);
    }
  }

  // Graphs
  renderGraphs() {
    this.renderXTGraph();
    this.renderVTGraph();
  }

  getMaxGraphTime() {
    if (this.recordedPoints.length > 0) {
      return Math.max(3.0, Math.max(...this.recordedPoints.map(p => p.t)) * 1.25);
    }
    return 3.0;
  }

  pixelToTimeXT(pixelX) {
    const padL = 45;
    const padR = 20;
    const plotW = this.canvasXT.clientWidth - padL - padR;
    const maxT = this.getMaxGraphTime();
    return Math.max(0, ((pixelX - padL) / plotW) * maxT);
  }

  renderXTGraph() {
    const ctx = this.ctxXT;
    const w = this.canvasXT.clientWidth;
    const h = this.canvasXT.clientHeight;

    ctx.clearRect(0, 0, w, h);

    const padL = 45;
    const padR = 20;
    const padT = 20;
    const padB = 35;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const maxT = this.getMaxGraphTime();
    const maxX = 2.6;

    ctx.strokeStyle = '#e9f4fb';
    ctx.lineWidth = 1;
    const numGridX = 6;
    const numGridY = 5;

    ctx.fillStyle = '#4b6570';
    ctx.font = '10px "Inter", sans-serif';
    ctx.textAlign = 'center';

    for (let i = 0; i <= numGridX; i++) {
      const t = (i / numGridX) * maxT;
      const x = padL + (t / maxT) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillText(`${t.toFixed(1)}s`, x, padT + plotH + 15);
    }

    ctx.textAlign = 'right';
    for (let j = 0; j <= numGridY; j++) {
      const pos = (j / numGridY) * maxX;
      const y = padT + plotH - (pos / maxX) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(`${pos.toFixed(1)}m`, padL - 6, y + 3);
    }

    ctx.strokeStyle = '#0f7e9b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    ctx.fillStyle = '#095f76';
    ctx.font = 'bold 10px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time t (s)', padL + plotW / 2, h - 5);

    ctx.save();
    ctx.translate(14, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Position x (m) [Front Bumper]', 0, 0);
    ctx.restore();

    // Quadratic Best Fit Curve
    if (this.quadFit && this.quadFit.valid) {
      ctx.strokeStyle = '#0f7e9b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      const steps = 80;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * maxT;
        const xPos = this.quadFit.a * t * t + this.quadFit.b * t + this.quadFit.c;
        const px = padL + (t / maxT) * plotW;
        const py = padT + plotH - (xPos / maxX) * plotH;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Tangent Line at scrubTime
      const t0 = this.scrubTime;
      const tangent = calculateTangent(this.quadFit, t0);
      const span = 0.8;
      const tA = Math.max(0, t0 - span);
      const tB = Math.min(maxT, t0 + span);
      const xA = tangent.evaluate(tA);
      const xB = tangent.evaluate(tB);

      const pxA = padL + (tA / maxT) * plotW;
      const pyA = padT + plotH - (xA / maxX) * plotH;
      const pxB = padL + (tB / maxT) * plotW;
      const pyB = padT + plotH - (xB / maxX) * plotH;

      ctx.strokeStyle = '#d67b19';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pxA, pyA);
      ctx.lineTo(pxB, pyB);
      ctx.stroke();
      ctx.setLineDash([]);

      const ptX = padL + (t0 / maxT) * plotW;
      const ptY = padT + plotH - (tangent.y0 / maxX) * plotH;
      ctx.fillStyle = '#d67b19';
      ctx.beginPath();
      ctx.arc(ptX, ptY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Points Scatter
    for (const pt of this.recordedPoints) {
      const px = padL + (pt.t / maxT) * plotW;
      const py = padT + plotH - (pt.x / maxX) * plotH;

      ctx.fillStyle = '#d67b19';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  renderVTGraph() {
    const ctx = this.ctxVT;
    const w = this.canvasVT.clientWidth;
    const h = this.canvasVT.clientHeight;

    ctx.clearRect(0, 0, w, h);

    const padL = 45;
    const padR = 20;
    const padT = 20;
    const padB = 35;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const maxT = this.getMaxGraphTime();
    const maxV = 2.5;

    ctx.strokeStyle = '#e9f4fb';
    ctx.lineWidth = 1;
    const numGridX = 6;
    const numGridY = 5;

    ctx.fillStyle = '#4b6570';
    ctx.font = '10px "Inter", sans-serif';
    ctx.textAlign = 'center';

    for (let i = 0; i <= numGridX; i++) {
      const t = (i / numGridX) * maxT;
      const x = padL + (t / maxT) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillText(`${t.toFixed(1)}s`, x, padT + plotH + 15);
    }

    ctx.textAlign = 'right';
    for (let j = 0; j <= numGridY; j++) {
      const vel = (j / numGridY) * maxV;
      const y = padT + plotH - (vel / maxV) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(`${vel.toFixed(1)}`, padL - 6, y + 3);
    }

    ctx.strokeStyle = '#d67b19';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    ctx.fillStyle = '#b86510';
    ctx.font = 'bold 10px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time t (s)', padL + plotW / 2, h - 5);

    ctx.save();
    ctx.translate(14, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Velocity v (m/s)', 0, 0);
    ctx.restore();

    // Linear Fit Line
    if (this.linearFit && this.linearFit.n >= 2) {
      const { slope, intercept } = this.linearFit;
      const t1 = 0;
      const v1 = intercept;
      const t2 = maxT;
      const v2 = slope * maxT + intercept;

      const px1 = padL + (t1 / maxT) * plotW;
      const py1 = padT + plotH - (v1 / maxV) * plotH;
      const px2 = padL + (t2 / maxT) * plotW;
      const py2 = padT + plotH - (v2 / maxV) * plotH;

      ctx.fillStyle = 'rgba(214, 123, 25, 0.08)';
      ctx.beginPath();
      ctx.moveTo(px1, padT + plotH);
      ctx.lineTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.lineTo(px2, padT + plotH);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#d67b19';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
    }

    for (const item of this.instantaneousVelocities) {
      const px = padL + (item.t / maxT) * plotW;
      const py = padT + plotH - (item.v / maxV) * plotH;

      ctx.fillStyle = '#d67b19';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  copyDataToClipboard(format = 'tsv') {
    if (this.recordedPoints.length === 0) {
      this.showToast('⚠️ No data to copy');
      return;
    }
    const text = formatDataForExport(this.recordedPoints, format);
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('📋 Data copied to clipboard!');
    }).catch(() => {
      this.showToast('⚠️ Copy failed; check browser permissions');
    });
  }

  downloadCSV() {
    if (this.recordedPoints.length === 0) {
      this.showToast('⚠️ No data to download');
      return;
    }
    const csvContent = formatDataForExport(this.recordedPoints, 'csv');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `downhill_motion_data_${this.angleDeg}deg.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.showToast('📥 CSV downloaded');
  }

  openInTangentSim() {
    this.copyDataToClipboard('tsv');
    const url = 'https://vladimirlopez.github.io/slope_tangents/';
    window.open(url, '_blank', 'noopener');
    this.showToast('🚀 Opening Tangent Tool (data copied to paste!)');
  }

  showToast(message) {
    if (!this.toastNotification) return;
    this.toastNotification.textContent = message;
    this.toastNotification.style.opacity = '1';
    this.toastNotification.style.transform = 'translateY(0)';
    setTimeout(() => {
      this.toastNotification.style.opacity = '0';
      this.toastNotification.style.transform = 'translateY(10px)';
    }, 2800);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new DownhillMotionApp();
});
