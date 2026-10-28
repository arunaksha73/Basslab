/**
 * BassLab 3D — Persistence / Import-Export
 * Preset import/export, sharing, validation.
 * Credits: Arunaksha Das
 */

import { getState, saveState, snapshotProfile, applyProfile, ADV_PRESETS, EXTRA_PRESETS } from './state.js';
import { toast } from './ui.js';

/* ── Preset validation ── */

const REQUIRED_PROFILE_FIELDS = ['gains'];

/**
 * Validate a preset/profile object.
 * Returns { valid: boolean, errors: string[] }
 */
export function validatePreset(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data is not a valid object.'] };
  }
  if (!Array.isArray(data.gains)) {
    errors.push('Missing or invalid "gains" array.');
  } else {
    if (data.gains.length !== 10) {
      errors.push(`Expected 10 EQ bands, got ${data.gains.length}.`);
    }
    data.gains.forEach((g, i) => {
      if (typeof g !== 'number' || g < -20 || g > 20) {
        errors.push(`Band ${i}: gain must be a number between -20 and 20.`);
      }
    });
  }
  if (data.pre !== undefined && (typeof data.pre !== 'number' || data.pre < -20 || data.pre > 20)) {
    errors.push('Preamp must be a number between -20 and 20.');
  }
  if (data.fx && typeof data.fx !== 'object') {
    errors.push('"fx" must be an object.');
  }
  if (data.fxv && typeof data.fxv !== 'object') {
    errors.push('"fxv" must be an object.');
  }
  if (data.parametricFilters) {
    if (!Array.isArray(data.parametricFilters)) {
      errors.push('"parametricFilters" must be an array.');
    } else if (data.parametricFilters.length > 8) {
      errors.push('Maximum 8 parametric filters allowed.');
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a full export bundle (may contain multiple presets).
 */
export function validateExportBundle(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid data format.'] };
  }
  if (data._app !== 'BassLab3D') {
    errors.push('Not a BassLab 3D export file.');
  }
  if (!data._exportVersion || typeof data._exportVersion !== 'number') {
    errors.push('Missing export version.');
  }
  if (data.presets && typeof data.presets === 'object') {
    for (const [name, preset] of Object.entries(data.presets)) {
      const r = validatePreset(preset);
      if (!r.valid) {
        errors.push(`Preset "${name}": ${r.errors.join('; ')}`);
      }
    }
  }
  if (data.profile) {
    const r = validatePreset(data.profile);
    if (!r.valid) {
      errors.push(`Profile: ${r.errors.join('; ')}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/* ── Export ── */

/**
 * Export current presets + profile as JSON.
 * Returns a Blob.
 */
export function exportPresets() {
  const s = getState();
  const bundle = {
    _app: 'BassLab3D',
    _exportVersion: 1,
    _exportDate: new Date().toISOString(),
    profile: snapshotProfile(),
    customPresets: { ...s.customPresets },
    profiles: { ...s.profiles }
  };
  const json = JSON.stringify(bundle, null, 2);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Download export file.
 */
export function downloadExport() {
  const blob = exportPresets();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `basslab3d-presets-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Presets exported', 'success');
}

/**
 * Share presets via Web Share API.
 */
export async function sharePresets() {
  const blob = exportPresets();
  const file = new File([blob], 'basslab3d-presets.json', { type: 'application/json' });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: 'BassLab 3D Presets',
        text: 'Check out my BassLab 3D audio presets!',
        files: [file]
      });
      toast('Shared successfully', 'success');
    } catch (e) {
      if (e.name !== 'AbortError') {
        toast('Share cancelled or failed', 'warn');
      }
    }
  } else {
    // Fallback: download
    downloadExport();
  }
}

/* ── Import ── */

/**
 * Import presets from a JSON file.
 * @param {File} file
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function importPresets(file) {
  try {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { success: false, message: 'Invalid JSON file.' };
    }

    const validation = validateExportBundle(data);
    if (!validation.valid) {
      return {
        success: false,
        message: 'Validation errors:\n' + validation.errors.join('\n')
      };
    }

    const s = getState();

    // Import profile if present
    if (data.profile) {
      applyProfile(data.profile);
    }

    // Import custom presets
    if (data.customPresets) {
      Object.assign(s.customPresets, data.customPresets);
    }

    // Import device profiles
    if (data.profiles) {
      Object.assign(s.profiles, data.profiles);
    }

    saveState();
    return {
      success: true,
      message: `Imported: ${data.profile ? '1 profile' : ''}${data.customPresets ? `, ${Object.keys(data.customPresets).length} presets` : ''}${data.profiles ? `, ${Object.keys(data.profiles).length} device profiles` : ''}`
    };
  } catch (e) {
    return { success: false, message: 'Failed to read file: ' + e.message };
  }
}

/**
 * Trigger file input for import.
 */
export function triggerImport(callback) {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    if (input.files && input.files[0]) {
      const result = await importPresets(input.files[0]);
      if (callback) callback(result);
    }
  });
  input.click();
}

/* ── QR Code sharing (for small presets) ── */

/**
 * Generate a QR code data URL from a preset.
 * Uses a compact encoding: base64 of compressed JSON.
 * Returns null if the data is too large for a QR code.
 */
export function generateQRData() {
  const profile = snapshotProfile();
  const compact = {
    g: profile.gains,
    p: profile.pre,
    m: profile.mode,
    f: profile.fx
  };
  const json = JSON.stringify(compact);
  // QR codes can hold about 2953 bytes (version 40, error correction L)
  // Keep it reasonable at ~500 chars for easy scanning
  if (json.length > 500) return null;
  // Return the data as a URL-safe string
  return 'bl3d:' + btoa(json);
}

/**
 * Parse QR code data and return a preset.
 */
export function parseQRData(data) {
  try {
    if (!data.startsWith('bl3d:')) return null;
    const json = atob(data.slice(5));
    const compact = JSON.parse(json);
    return {
      gains: compact.g,
      pre: compact.p || 0,
      mode: compact.m || 'Custom',
      preset: 'QR Import',
      fx: compact.f || {},
      fxv: {}
    };
  } catch (e) {
    return null;
  }
}

/* ── Custom preset management ── */

export function saveCustomPreset(name) {
  const s = getState();
  s.customPresets[name] = snapshotProfile();
  s.preset = name;
  saveState();
  toast(`Preset "${name}" saved`, 'success');
}

export function deleteCustomPreset(name) {
  const s = getState();
  delete s.customPresets[name];
  if (s.preset === name) s.preset = 'Custom';
  saveState();
  toast(`Preset "${name}" deleted`, 'info');
}

export function getAllPresetNames() {
  const s = getState();
  return [
    'Flat', 'Bass Boost',
    ...Object.keys(ADV_PRESETS),
    'Vocal Clarity', 'Night Listening',
    ...Object.keys(s.customPresets)
  ];
}
