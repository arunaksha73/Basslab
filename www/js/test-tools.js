/**
 * BassLab 3D — Test Tools
 * Frequency sweep, pink noise, L/R balance test.
 * All audio is generated and played through the app's own engine.
 * Credits: Arunaksha Das
 */

import engine from './audio-engine.js';

let _activeSrc   = null;
let _activeTimer  = null;

/**
 * Stop any currently playing test tone.
 */
export function stopTest() {
  if (_activeSrc) {
    try { _activeSrc.stop(); } catch (e) { /* already stopped */ }
    _activeSrc = null;
  }
  if (_activeTimer) {
    clearTimeout(_activeTimer);
    _activeTimer = null;
  }
}

/**
 * Generate a frequency sweep from startHz to endHz.
 * @param {number} startHz  Starting frequency (default 20)
 * @param {number} endHz    Ending frequency (default 20000)
 * @param {number} duration Sweep duration in seconds (default 10)
 * @param {function} onProgress  Called with current frequency (0-1 progress)
 * @returns {function} stop function
 */
export function playSweep(startHz = 20, endHz = 20000, duration = 10, onProgress = null) {
  stopTest();
  if (!engine.ctx) return () => {};

  const ctx = engine.ctx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = startHz;
  gain.gain.value = 0.3; // moderate level

  // Exponential frequency sweep
  osc.frequency.setValueAtTime(startHz, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endHz, ctx.currentTime + duration);

  // Soft attack/release to avoid clicks
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.3, ctx.currentTime + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

  osc.connect(gain);
  engine.connectBufferSource(gain);
  osc.start();
  osc.stop(ctx.currentTime + duration);
  _activeSrc = osc;

  // Progress reporting
  if (onProgress) {
    const startTime = ctx.currentTime;
    const tick = () => {
      if (!_activeSrc) return;
      const elapsed = ctx.currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const currentFreq = startHz * Math.pow(endHz / startHz, progress);
      onProgress(progress, currentFreq);
      if (progress < 1) {
        _activeTimer = setTimeout(tick, 50);
      }
    };
    tick();
  }

  osc.onended = () => {
    _activeSrc = null;
    if (onProgress) onProgress(1, endHz);
  };

  return stopTest;
}

/**
 * Play pink noise.
 * Pink noise has equal energy per octave (1/f spectrum).
 * @param {number} duration  Duration in seconds (default 10)
 * @returns {function} stop function
 */
export function playPinkNoise(duration = 10) {
  stopTest();
  if (!engine.ctx) return () => {};

  const ctx = engine.ctx;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);

  // Paul Kellet's refined method for pink noise generation
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.05; // scaled down
      b6 = white * 0.115926;
    }
  }

  const src  = ctx.createBufferSource();
  src.buffer = buffer;

  // Soft attack/release
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.25, ctx.currentTime + duration - 0.1);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

  src.connect(gain);
  engine.connectBufferSource(gain);
  src.start();
  src.stop(ctx.currentTime + duration);
  _activeSrc = src;

  src.onended = () => { _activeSrc = null; };

  return stopTest;
}

/**
 * Play a left/right balance test.
 * Alternates a 1 kHz tone between left and right channels.
 * @param {number} cycleDuration  Duration of each L/R cycle in seconds (default 2)
 * @param {number} totalDuration  Total duration (default 8)
 * @param {function} onSide  Called with 'left' or 'right' as each cycle starts
 * @returns {function} stop function
 */
export function playBalanceTest(cycleDuration = 2, totalDuration = 8, onSide = null) {
  stopTest();
  if (!engine.ctx) return () => {};

  const ctx = engine.ctx;
  const cycles = Math.floor(totalDuration / cycleDuration);
  let currentCycle = 0;

  function playCycle() {
    if (currentCycle >= cycles) {
      _activeSrc = null;
      if (onSide) onSide('done');
      return;
    }

    const isLeft = currentCycle % 2 === 0;
    if (onSide) onSide(isLeft ? 'left' : 'right');

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1000;

    // Create stereo panning
    const panner = ctx.createStereoPanner();
    panner.pan.value = isLeft ? -1 : 1;

    const gain = ctx.createGain();
    // Soft attack/release
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.3, ctx.currentTime + cycleDuration - 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + cycleDuration);

    osc.connect(panner);
    panner.connect(gain);
    engine.connectBufferSource(gain);
    osc.start();
    osc.stop(ctx.currentTime + cycleDuration);
    _activeSrc = osc;

    osc.onended = () => {
      currentCycle++;
      playCycle();
    };
  }

  playCycle();
  return stopTest;
}

/**
 * Check if a test is currently playing.
 */
export function isTestPlaying() {
  return _activeSrc !== null;
}
