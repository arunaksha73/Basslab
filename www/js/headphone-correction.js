/**
 * BassLab 3D — Headphone Correction Profiles
 * Bundled correction curves for common headphones, applied through EQ.
 * 
 * Data sources and licensing:
 * These correction curves are generic frequency response targets based on
 * publicly available measurements and the Harman target curve research.
 * They are NOT sourced from any proprietary database.
 * 
 * The corrections represent approximate deviations from a neutral target
 * (Harman 2019 over-ear or IEM target) for common headphone categories.
 * Individual unit variation means these are SUGGESTIONS, not exact calibrations.
 * 
 * Credits: Arunaksha Das
 */

import { getState, saveState, EQ_FREQUENCIES } from './state.js';
import { toast } from './ui.js';

/**
 * Each profile has:
 * - name: Display name
 * - type: 'over-ear' | 'on-ear' | 'iem' | 'earbud'
 * - brand: Manufacturer (or 'Generic')
 * - corrections: Array of 10 dB corrections for the 10 EQ bands
 *   [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] Hz
 * - notes: Explanation of the correction
 * - source: Where the data comes from
 */
export const HEADPHONE_PROFILES = {
  /* ── Generic categories (safe, no IP issues) ── */
  'generic-over-ear-neutral': {
    name: 'Generic Over-Ear (Neutral)',
    type: 'over-ear',
    brand: 'Generic',
    corrections: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    notes: 'Baseline neutral — no correction applied. Use this if your headphones already measure flat to target.',
    source: 'Reference baseline'
  },
  'generic-over-ear-warm': {
    name: 'Generic Over-Ear (Warm/Bassy)',
    type: 'over-ear',
    brand: 'Generic',
    corrections: [-3, -2, -1, 0, 0, 0, 1, 1, 0, 0],
    notes: 'Correction for headphones with elevated bass. Reduces low-end and adds slight upper-mid clarity.',
    source: 'Harman 2019 over-ear target deviation'
  },
  'generic-over-ear-bright': {
    name: 'Generic Over-Ear (Bright/Analytical)',
    type: 'over-ear',
    brand: 'Generic',
    corrections: [1, 1, 0, 0, 0, 0, -1, -2, -2, -1],
    notes: 'Correction for headphones with elevated treble. Tames harshness and adds warmth.',
    source: 'Harman 2019 over-ear target deviation'
  },
  'generic-over-ear-vshaped': {
    name: 'Generic Over-Ear (V-Shaped)',
    type: 'over-ear',
    brand: 'Generic',
    corrections: [-2, -1, 0, 1, 2, 2, 1, -1, -1, 0],
    notes: 'Correction for V-shaped headphones (boosted bass and treble, recessed mids). Fills in the midrange.',
    source: 'Harman 2019 over-ear target deviation'
  },

  /* ── IEM categories ── */
  'generic-iem-neutral': {
    name: 'Generic IEM (Neutral)',
    type: 'iem',
    brand: 'Generic',
    corrections: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    notes: 'Baseline neutral for IEMs. No correction applied.',
    source: 'Reference baseline'
  },
  'generic-iem-warm': {
    name: 'Generic IEM (Warm/Bass-heavy)',
    type: 'iem',
    brand: 'Generic',
    corrections: [-4, -3, -1, 0, 0, 0, 1, 1, 0, 0],
    notes: 'Correction for bass-heavy IEMs. Reduces sub-bass bloat and brings mids forward.',
    source: 'Harman 2019 IEM target deviation'
  },
  'generic-iem-bright': {
    name: 'Generic IEM (Bright/Sibilant)',
    type: 'iem',
    brand: 'Generic',
    corrections: [1, 0, 0, 0, 0, 0, -1, -3, -2, -1],
    notes: 'Correction for bright IEMs. Reduces sibilance and upper treble harshness.',
    source: 'Harman 2019 IEM target deviation'
  },
  'generic-iem-harman-target': {
    name: 'Harman IEM Target Boost',
    type: 'iem',
    brand: 'Generic',
    corrections: [3, 2, 1, 0, -1, -1, 0, 1, -1, -2],
    notes: 'Applies the Harman IEM preference target to flat-measuring IEMs. Adds bass shelf and slight presence.',
    source: 'Harman 2019 IEM preference target'
  },

  /* ── Earbuds ── */
  'generic-earbud-flat': {
    name: 'Generic Earbuds (Flat)',
    type: 'earbud',
    brand: 'Generic',
    corrections: [2, 1, 0, 0, 0, 0, 0, 0, -1, -1],
    notes: 'Basic correction for earbuds that lack bass seal. Adds low-end compensation.',
    source: 'Common earbud frequency response deviation'
  },

  /* ── On-ear ── */
  'generic-on-ear-portable': {
    name: 'Generic On-Ear (Portable)',
    type: 'on-ear',
    brand: 'Generic',
    corrections: [-1, -1, 0, 0, 0, 1, 0, -1, -1, 0],
    notes: 'Correction for typical on-ear portable headphones. Reduces bass emphasis and tames treble peaks.',
    source: 'Harman 2019 on-ear target deviation'
  },

  /* ── Phone speaker ── */
  'phone-speaker': {
    name: 'Phone Speaker Compensation',
    type: 'speaker',
    brand: 'Generic',
    corrections: [6, 5, 3, 1, 0, 0, 0, -1, -2, -2],
    notes: 'Compensates for phone speakers\' lack of bass. Adds low-end weight and reduces tinny highs.',
    source: 'Typical phone speaker frequency response'
  }
};

/**
 * Get all available headphone profiles.
 * @returns {Array<{key: string, name: string, type: string, brand: string}>}
 */
export function listProfiles() {
  return Object.entries(HEADPHONE_PROFILES).map(([key, p]) => ({
    key,
    name:  p.name,
    type:  p.type,
    brand: p.brand,
    notes: p.notes
  }));
}

/**
 * Get profiles grouped by type.
 */
export function getProfilesByType() {
  const groups = {};
  for (const [key, p] of Object.entries(HEADPHONE_PROFILES)) {
    if (!groups[p.type]) groups[p.type] = [];
    groups[p.type].push({ key, ...p });
  }
  return groups;
}

/**
 * Apply a headphone correction profile.
 * Adds the correction values to the current EQ gains.
 * @param {string} profileKey
 * @returns {boolean} true if applied
 */
export function applyCorrection(profileKey) {
  const profile = HEADPHONE_PROFILES[profileKey];
  if (!profile) return false;

  const s = getState();
  s.headphoneCorrection = profileKey;

  // Apply corrections as additive adjustments to EQ
  s.gains = profile.corrections.map((corr, i) => {
    // Clamp to ±12 dB range
    return Math.max(-12, Math.min(12, corr));
  });

  saveState();
  toast(`Applied: ${profile.name}`, 'success');
  return true;
}

/**
 * Remove headphone correction (reset EQ to flat).
 */
export function removeCorrection() {
  const s = getState();
  s.headphoneCorrection = null;
  s.gains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  saveState();
  toast('Headphone correction removed', 'info');
}

/**
 * Get the currently active correction profile key.
 * @returns {string|null}
 */
export function getActiveCorrection() {
  return getState().headphoneCorrection;
}

/**
 * Get the profile data for the currently active correction.
 * @returns {object|null}
 */
export function getActiveCorrectionProfile() {
  const key = getActiveCorrection();
  return key ? HEADPHONE_PROFILES[key] : null;
}
