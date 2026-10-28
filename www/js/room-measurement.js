/**
 * BassLab 3D — Room Measurement Helper
 * Uses the phone microphone to measure room frequency response
 * and suggests EQ corrections.
 *
 * IMPORTANT LIMITATIONS (displayed to user):
 * - Phone microphones are NOT calibrated measurement tools
 * - Results are SUGGESTIONS, not precise corrections
 * - Ambient noise, mic placement, and room modes all affect accuracy
 * - This is a basic educational/helper tool, not a replacement for
 *   professional acoustic measurement equipment
 *
 * Credits: Arunaksha Das
 */

import engine from './audio-engine.js';
import { EQ_FREQUENCIES, getState, saveState } from './state.js';
import { toast } from './ui.js';

const MEASUREMENT_DURATION = 5; // seconds of pink noise per measurement

let _measurementState = {
  status:       'idle',    // 'idle' | 'requesting' | 'calibrating' | 'measuring' | 'analysing' | 'done' | 'error'
  progress:     0,         // 0–1
  results:      null,      // { frequencies, levels, suggestions }
  error:        null,
  micStream:    null,
  micSource:    null
};

const _listeners = [];

function notify() {
  _listeners.forEach(fn => fn({ ..._measurementState }));
}

/**
 * Subscribe to measurement state changes.
 */
export function onMeasurementChange(fn) {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}

/**
 * Get current measurement state.
 */
export function getMeasurementState() {
  return { ..._measurementState };
}

/**
 * Start a room measurement.
 * Steps:
 * 1. Request microphone permission (with explanation)
 * 2. Play pink noise through speakers
 * 3. Capture mic input and analyse frequency response
 * 4. Compare to expected flat response
 * 5. Generate EQ suggestions
 *
 * @returns {Promise<{success: boolean, results?: object, error?: string}>}
 */
export async function startMeasurement() {
  if (_measurementState.status === 'measuring') {
    return { success: false, error: 'Measurement already in progress' };
  }

  // Step 1: Request mic
  _measurementState.status = 'requesting';
  _measurementState.progress = 0;
  _measurementState.error = null;
  notify();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl:  false
      }
    });
  } catch (e) {
    _measurementState.status = 'error';
    _measurementState.error = e.name === 'NotAllowedError'
      ? 'Microphone permission denied. You need to allow microphone access to measure the room.'
      : 'Could not access microphone: ' + e.message;
    notify();
    return { success: false, error: _measurementState.error };
  }

  _measurementState.micStream = stream;

  // Step 2: Set up analyser
  if (!engine.ctx) {
    _measurementState.status = 'error';
    _measurementState.error = 'Audio engine not initialised. Play something first, then try again.';
    stream.getTracks().forEach(t => t.stop());
    notify();
    return { success: false, error: _measurementState.error };
  }

  const ctx = engine.ctx;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.5;

  const micSource = ctx.createMediaStreamSource(stream);
  micSource.connect(analyser);
  // DO NOT connect to destination — we don't want feedback
  _measurementState.micSource = micSource;

  // Step 3: Play pink noise and measure
  _measurementState.status = 'measuring';
  notify();

  // Generate pink noise
  const bufferSize = ctx.sampleRate * MEASUREMENT_DURATION;
  const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
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
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
      b6 = white * 0.115926;
    }
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.25, ctx.currentTime + MEASUREMENT_DURATION - 0.2);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + MEASUREMENT_DURATION);
  src.connect(gain);
  gain.connect(ctx.destination); // Play through speakers directly

  src.start();

  // Accumulate frequency data
  const binCount = analyser.frequencyBinCount;
  const accumulator = new Float64Array(binCount);
  let sampleCount = 0;

  return new Promise((resolve) => {
    const startTime = Date.now();
    const collectInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      _measurementState.progress = Math.min(elapsed / MEASUREMENT_DURATION, 1);
      notify();

      // Skip first 0.5s (attack transient)
      if (elapsed < 0.5) return;

      const freqData = new Float32Array(binCount);
      analyser.getFloatFrequencyData(freqData);
      for (let i = 0; i < binCount; i++) {
        accumulator[i] += freqData[i];
      }
      sampleCount++;

      if (elapsed >= MEASUREMENT_DURATION) {
        clearInterval(collectInterval);
        // Clean up
        stream.getTracks().forEach(t => t.stop());
        micSource.disconnect();

        // Analyse
        _measurementState.status = 'analysing';
        notify();

        const results = analyseResults(accumulator, sampleCount, ctx.sampleRate, binCount);
        _measurementState.results = results;
        _measurementState.status = 'done';
        _measurementState.progress = 1;
        notify();

        resolve({ success: true, results });
      }
    }, 100);

    src.onended = () => {
      // Ensure cleanup even if timing is off
      setTimeout(() => {
        if (_measurementState.status === 'measuring') {
          clearInterval(collectInterval);
          stream.getTracks().forEach(t => t.stop());
          micSource.disconnect();
          _measurementState.status = 'error';
          _measurementState.error = 'Measurement ended unexpectedly';
          notify();
          resolve({ success: false, error: _measurementState.error });
        }
      }, 500);
    };
  });
}

/**
 * Analyse accumulated frequency data and produce EQ suggestions.
 */
function analyseResults(accumulator, sampleCount, sampleRate, binCount) {
  // Average the accumulated data
  const avgSpectrum = new Float64Array(binCount);
  for (let i = 0; i < binCount; i++) {
    avgSpectrum[i] = accumulator[i] / sampleCount;
  }

  // Get level at each EQ frequency
  const freqResolution = sampleRate / (binCount * 2);
  const levels = EQ_FREQUENCIES.map(freq => {
    const bin = Math.round(freq / freqResolution);
    // Average a few bins around the target frequency
    const start = Math.max(0, bin - 2);
    const end   = Math.min(binCount - 1, bin + 2);
    let sum = 0;
    for (let i = start; i <= end; i++) sum += avgSpectrum[i];
    return sum / (end - start + 1);
  });

  // Normalise to 0 dB reference (use 1 kHz as reference)
  const refIdx = EQ_FREQUENCIES.indexOf(1000);
  const refLevel = levels[refIdx] || levels[4];
  const normalised = levels.map(l => l - refLevel);

  // Generate suggestions: cut peaks, don't boost dips (conservative approach)
  const suggestions = normalised.map(level => {
    if (level > 3) {
      // Room mode / resonance: suggest cut
      return -Math.round(Math.min(level * 0.6, 8));
    } else if (level > 1) {
      return -Math.round(level * 0.4);
    }
    // Don't boost dips — that wastes headroom and often sounds worse
    return 0;
  });

  return {
    frequencies: EQ_FREQUENCIES,
    levels: normalised.map(l => Math.round(l * 10) / 10),
    suggestions,
    timestamp: Date.now()
  };
}

/**
 * Apply measurement suggestions to EQ.
 */
export function applySuggestions() {
  if (!_measurementState.results) return false;
  const s = getState();
  s.gains = _measurementState.results.suggestions.slice();
  saveState();
  toast('Room correction suggestions applied to EQ', 'success');
  return true;
}

/**
 * Cancel an in-progress measurement.
 */
export function cancelMeasurement() {
  if (_measurementState.micStream) {
    _measurementState.micStream.getTracks().forEach(t => t.stop());
  }
  if (_measurementState.micSource) {
    try { _measurementState.micSource.disconnect(); } catch (e) { /* OK */ }
  }
  _measurementState = {
    status: 'idle',
    progress: 0,
    results: null,
    error: null,
    micStream: null,
    micSource: null
  };
  notify();
}

/**
 * Get the disclaimer text to show the user before measuring.
 */
export function getDisclaimer() {
  return `Room measurement uses your phone's microphone to estimate the room's frequency response.

Important limitations:
• Phone microphones are NOT calibrated — they have their own frequency response that affects results
• Placement matters: hold the phone at your listening position, facing the speakers
• Results are SUGGESTIONS for EQ cuts, not precise corrections
• This tool only suggests cutting peaks, not boosting dips (safer for your speakers)
• For accurate measurement, professional tools like REW with a calibrated microphone are recommended

The microphone is used ONLY during measurement and is immediately released afterward. No audio is recorded or stored.`;
}
