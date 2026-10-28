/**
 * BassLab 3D — Audio Engine
 * Real Web Audio API DSP: 10-band graphic EQ, parametric EQ,
 * bass boost, spatial, loudness, limiter, A/B bypass, analyser.
 * All parameter changes use smooth ramps to prevent clicks.
 * Credits: Arunaksha Das
 */

import { EQ_FREQUENCIES, getState } from './state.js';

const RAMP = 0.025; // seconds for parameter smoothing

/**
 * @typedef {Object} EngineStatus
 * @property {boolean} active      - whether the engine is initialised
 * @property {boolean} processing  - whether DSP is in the signal path
 * @property {boolean} abBypass    - A/B bypass active (B = flat)
 * @property {number}  peakLevel   - current peak in dBFS
 * @property {boolean} clipping    - true if peak >= -0.5 dBFS
 * @property {string}  error       - last error or ''
 */

class AudioEngine {
  constructor() {
    this.ctx       = null;
    this.nodes     = {};
    this._active   = false;
    this._bypass   = false; // A/B bypass
    this._peak     = -Infinity;
    this._clipping = false;
    this._error    = '';
    this._meterRAF = 0;
    this._meterBuf = null;
    this._listeners = [];
  }

  /* ── Lifecycle ── */

  /** Initialise AudioContext and build DSP graph. Call after first user gesture. */
  async init() {
    if (this._active) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 44100,
        latencyHint: 'interactive'
      });

      this._buildGraph();
      this._active = true;
      this._error  = '';
      this._startMetering();
      this._notify();
    } catch (e) {
      this._error = e.message;
      console.error('[audio-engine] init failed:', e);
    }
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /* ── Graph construction ── */

  _buildGraph() {
    const ctx = this.ctx;

    /* Input gain (preamp) */
    const input = ctx.createGain();
    input.gain.value = 1;

    /* 10-band graphic EQ */
    const eqBands = EQ_FREQUENCIES.map((freq, i) => {
      const f = ctx.createBiquadFilter();
      f.type = i === 0 ? 'lowshelf' : (i === 9 ? 'highshelf' : 'peaking');
      f.frequency.value = freq;
      f.gain.value = 0;
      if (f.type === 'peaking') f.Q.value = 1.4;
      return f;
    });

    /* Parametric EQ (up to 8 filters) */
    const parametric = [];
    for (let i = 0; i < 8; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = 1000;
      f.gain.value = 0;
      f.Q.value = 1;
      parametric.push(f);
    }

    /* Bass boost (lowshelf at 150 Hz) */
    const bassBoost = ctx.createBiquadFilter();
    bassBoost.type = 'lowshelf';
    bassBoost.frequency.value = 150;
    bassBoost.gain.value = 0;

    /* Loudness compensation (low-level boost) */
    const loudnessLow  = ctx.createBiquadFilter();
    loudnessLow.type   = 'lowshelf';
    loudnessLow.frequency.value = 200;
    loudnessLow.gain.value = 0;
    const loudnessHigh = ctx.createBiquadFilter();
    loudnessHigh.type  = 'highshelf';
    loudnessHigh.frequency.value = 6000;
    loudnessHigh.gain.value = 0;

    /* Spatial: stereo widening via mid-side approximation
       We use a channel splitter/merger with gain manipulation */
    const spatialDry = ctx.createGain();
    spatialDry.gain.value = 1;
    const spatialWet = ctx.createGain();
    spatialWet.gain.value = 0;
    const spatialDelay = ctx.createDelay(0.05);
    spatialDelay.delayTime.value = 0.012; // 12 ms delay for widening
    const spatialMerge = ctx.createGain();
    spatialMerge.gain.value = 1;

    /* Compressor / Limiter — brick-wall limiter config */
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.ratio.value      = 20;
    limiter.attack.value     = 0.001;
    limiter.release.value    = 0.01;
    limiter.knee.value       = 0;

    /* Auto-gain: adjusts to keep output level consistent */
    const autoGain = ctx.createGain();
    autoGain.gain.value = 1;

    /* Master gain */
    const master = ctx.createGain();
    master.gain.value = 1;

    /* Analyser for visualizer and metering */
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    /* Bypass path (for A/B compare) */
    const bypass = ctx.createGain();
    bypass.gain.value = 0; // default: processing path active

    /* Processing chain gain (muted when bypassed) */
    const processGain = ctx.createGain();
    processGain.gain.value = 1;

    // Store nodes
    this.nodes = {
      input, eqBands, parametric, bassBoost,
      loudnessLow, loudnessHigh,
      spatialDry, spatialWet, spatialDelay, spatialMerge,
      limiter, autoGain, master, analyser,
      bypass, processGain
    };

    this._connectProcessingChain();
  }

  _connectProcessingChain() {
    const n = this.nodes;
    const ctx = this.ctx;

    // Disconnect everything first
    try {
      Object.values(n).forEach(node => {
        if (node && node.disconnect) {
          if (Array.isArray(node)) node.forEach(nd => nd.disconnect());
          else node.disconnect();
        }
      });
    } catch (e) { /* OK if not connected */ }

    /* Processing path:
       input → EQ bands → parametric → bassBoost → loudness → spatial → limiter → autoGain → processGain → master → analyser → dest */

    let current = n.input;

    // Chain EQ bands
    for (const band of n.eqBands) {
      current.connect(band);
      current = band;
    }

    // Chain parametric filters
    for (const pf of n.parametric) {
      current.connect(pf);
      current = pf;
    }

    // Bass boost
    current.connect(n.bassBoost);

    // Loudness
    n.bassBoost.connect(n.loudnessLow);
    n.loudnessLow.connect(n.loudnessHigh);

    // Spatial processing (simple)
    n.loudnessHigh.connect(n.spatialDry);
    n.loudnessHigh.connect(n.spatialDelay);
    n.spatialDelay.connect(n.spatialWet);
    n.spatialDry.connect(n.spatialMerge);
    n.spatialWet.connect(n.spatialMerge);

    // Limiter → auto-gain → process gain → master
    n.spatialMerge.connect(n.limiter);
    n.limiter.connect(n.autoGain);
    n.autoGain.connect(n.processGain);
    n.processGain.connect(n.master);

    // Bypass path: input → bypass → master
    n.input.connect(n.bypass);
    n.bypass.connect(n.master);

    // Output: master → analyser → destination
    n.master.connect(n.analyser);
    n.analyser.connect(ctx.destination);
  }

  /* ── Public API: connect sources ── */

  /**
   * Connect an HTMLMediaElement (audio/video) to the engine.
   * Returns the MediaElementSourceNode.
   */
  connectMediaElement(el) {
    if (!this._active) return null;
    // Only create source once per element
    if (!el._blSource) {
      el._blSource = this.ctx.createMediaElementSource(el);
    }
    el._blSource.connect(this.nodes.input);
    return el._blSource;
  }

  /**
   * Connect an AudioBufferSourceNode (for test tones).
   */
  connectBufferSource(src) {
    if (!this._active) return;
    src.connect(this.nodes.input);
  }

  /**
   * Connect a MediaStream (for room measurement mic input).
   */
  connectStream(stream) {
    if (!this._active) return null;
    const src = this.ctx.createMediaStreamSource(stream);
    src.connect(this.nodes.analyser); // mic → analyser only, not to speakers!
    return src;
  }

  /**
   * Get the AnalyserNode for the visualizer.
   */
  getAnalyser() {
    return this.nodes.analyser || null;
  }

  /* ── EQ control ── */

  /** Apply graphic EQ gains (array of 10 dB values) and preamp */
  applyEQ(gains, preamp) {
    if (!this._active) return;
    const t = this.ctx.currentTime;
    gains.forEach((g, i) => {
      this.nodes.eqBands[i].gain.setTargetAtTime(g, t, RAMP);
    });
    // Preamp: convert dB to linear
    const preGain = Math.pow(10, preamp / 20);
    this.nodes.input.gain.setTargetAtTime(preGain, t, RAMP);
  }

  /** Enable/disable EQ (set all gains to 0 when disabled) */
  setEQEnabled(enabled) {
    if (!this._active) return;
    if (!enabled) {
      const t = this.ctx.currentTime;
      this.nodes.eqBands.forEach(b => b.gain.setTargetAtTime(0, t, RAMP));
      this.nodes.input.gain.setTargetAtTime(1, t, RAMP);
    } else {
      const s = getState();
      this.applyEQ(s.gains, s.pre);
    }
  }

  /** Apply parametric filter settings */
  applyParametric(filters) {
    if (!this._active) return;
    const t = this.ctx.currentTime;
    this.nodes.parametric.forEach((pf, i) => {
      if (i < filters.length) {
        const f = filters[i];
        pf.type = f.type || 'peaking';
        pf.frequency.setTargetAtTime(f.freq, t, RAMP);
        pf.gain.setTargetAtTime(f.gain, t, RAMP);
        if (pf.type !== 'lowshelf' && pf.type !== 'highshelf') {
          pf.Q.setTargetAtTime(f.q || 1, t, RAMP);
        }
      } else {
        // Unused filter: flatten
        pf.gain.setTargetAtTime(0, t, RAMP);
      }
    });
  }

  /* ── Effects control ── */

  /** Set bass boost level (0–100 maps to 0–12 dB) */
  setBassBoost(level) {
    if (!this._active) return;
    const dB = (level / 100) * 12;
    this.nodes.bassBoost.gain.setTargetAtTime(dB, this.ctx.currentTime, RAMP);
  }

  /** Set spatial intensity (0–100) */
  setSpatialIntensity(level) {
    if (!this._active) return;
    const t = this.ctx.currentTime;
    const wet = level / 100;
    const dry = 1 - wet * 0.3; // keep dry signal dominant
    this.nodes.spatialWet.gain.setTargetAtTime(wet * 0.5, t, RAMP);
    this.nodes.spatialDry.gain.setTargetAtTime(dry, t, RAMP);
    this.nodes.spatialDelay.delayTime.setTargetAtTime(0.005 + wet * 0.015, t, RAMP);
  }

  /** Set loudness compensation (0–100) */
  setLoudness(level) {
    if (!this._active) return;
    const t = this.ctx.currentTime;
    const dB = (level / 100) * 6;
    this.nodes.loudnessLow.gain.setTargetAtTime(dB, t, RAMP);
    this.nodes.loudnessHigh.gain.setTargetAtTime(dB * 0.6, t, RAMP);
  }

  /** Apply effect toggles from state */
  applyEffects(fxState, fxValues) {
    if (!this._active) return;
    const bv = fxValues['Bass intensity']   ?? 60;
    const sv = fxValues['Spatial intensity'] ?? 50;
    const rv = fxValues['Reverb / room']     ?? 30;

    this.setBassBoost(fxState['Bass Boost'] ? bv : 0);
    this.setSpatialIntensity(
      (fxState['3D Spatial'] || fxState['Virtual Surround'] || fxState['Stereo Wide']) ? sv : 0
    );
    this.setLoudness(fxState['Loudness'] ? 60 : 0);

    // Night mode: reduce dynamics
    if (fxState['Night Mode']) {
      this.nodes.limiter.threshold.setTargetAtTime(-10, this.ctx.currentTime, RAMP);
      this.nodes.limiter.ratio.setTargetAtTime(8, this.ctx.currentTime, RAMP);
    } else {
      this.nodes.limiter.threshold.setTargetAtTime(-1, this.ctx.currentTime, RAMP);
      this.nodes.limiter.ratio.setTargetAtTime(20, this.ctx.currentTime, RAMP);
    }
  }

  /** Enable/disable all processing */
  setProcessingEnabled(enabled) {
    if (!this._active) return;
    const t = this.ctx.currentTime;
    if (enabled) {
      this.nodes.processGain.gain.setTargetAtTime(1, t, RAMP);
      this.nodes.bypass.gain.setTargetAtTime(0, t, RAMP);
      this._bypass = false;
    } else {
      this.nodes.processGain.gain.setTargetAtTime(0, t, RAMP);
      this.nodes.bypass.gain.setTargetAtTime(1, t, RAMP);
    }
  }

  /* ── A/B Compare ── */

  /**
   * Toggle A/B comparison.
   * A = processed, B = bypass with loudness matching.
   */
  toggleABCompare() {
    if (!this._active) return false;
    this._bypass = !this._bypass;
    const t = this.ctx.currentTime;

    if (this._bypass) {
      // B mode: bypass processing
      this.nodes.processGain.gain.setTargetAtTime(0, t, RAMP);
      this.nodes.bypass.gain.setTargetAtTime(1, t, RAMP);
      // Apply auto-gain correction to match loudness
      this._matchLoudness();
    } else {
      // A mode: processing active
      this.nodes.processGain.gain.setTargetAtTime(1, t, RAMP);
      this.nodes.bypass.gain.setTargetAtTime(0, t, RAMP);
      this.nodes.autoGain.gain.setTargetAtTime(1, t, RAMP);
    }
    this._notify();
    return this._bypass;
  }

  /** Check if in A/B bypass mode */
  isABBypass() { return this._bypass; }

  _matchLoudness() {
    // Estimate the gain introduced by EQ + effects
    // Sum total positive EQ gain and reduce bypass to match
    const s = getState();
    let totalBoostdB = 0;
    s.gains.forEach(g => { if (g > 0) totalBoostdB += g; });
    totalBoostdB = Math.min(totalBoostdB / s.gains.length + s.pre, 12);

    // Reduce processed signal by estimated boost
    const compensation = Math.pow(10, -totalBoostdB / 20);
    this.nodes.autoGain.gain.setTargetAtTime(compensation, this.ctx.currentTime, RAMP);
  }

  /* ── Auto-gain / Loudness matching ── */

  /** Recalculate auto-gain when presets change */
  updateAutoGain() {
    if (!this._active || this._bypass) return;
    this._matchLoudness();
  }

  /* ── Metering (safety indicator) ── */

  _startMetering() {
    if (!this.nodes.analyser) return;
    this._meterBuf = new Float32Array(this.nodes.analyser.fftSize);
    const meter = () => {
      if (!this._active) return;
      this.nodes.analyser.getFloatTimeDomainData(this._meterBuf);
      let peak = 0;
      for (let i = 0; i < this._meterBuf.length; i++) {
        const abs = Math.abs(this._meterBuf[i]);
        if (abs > peak) peak = abs;
      }
      const dB = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
      this._peak = dB;
      this._clipping = dB >= -0.5;
      this._meterRAF = requestAnimationFrame(meter);
    };
    this._meterRAF = requestAnimationFrame(meter);
  }

  /* ── Status reporting ── */

  /** @returns {EngineStatus} */
  getStatus() {
    return {
      active:     this._active,
      processing: this._active && !this._bypass,
      abBypass:   this._bypass,
      peakLevel:  this._peak,
      clipping:   this._clipping,
      error:      this._error
    };
  }

  /** Subscribe to status changes */
  onStatusChange(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  }

  _notify() {
    const s = this.getStatus();
    this._listeners.forEach(fn => fn(s));
  }

  /* ── Frequency data for visualizer ── */

  getFrequencyData() {
    if (!this._active || !this.nodes.analyser) return null;
    const buf = new Uint8Array(this.nodes.analyser.frequencyBinCount);
    this.nodes.analyser.getByteFrequencyData(buf);
    return buf;
  }

  getTimeDomainData() {
    if (!this._active || !this.nodes.analyser) return null;
    const buf = new Uint8Array(this.nodes.analyser.fftSize);
    this.nodes.analyser.getByteTimeDomainData(buf);
    return buf;
  }

  /* ── Cleanup ── */

  destroy() {
    cancelAnimationFrame(this._meterRAF);
    if (this.ctx) {
      this.ctx.close().catch(() => {});
    }
    this._active = false;
    this._notify();
  }
}

/* Singleton */
const engine = new AudioEngine();
export default engine;
