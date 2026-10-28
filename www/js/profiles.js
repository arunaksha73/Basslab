/**
 * BassLab 3D — Per-Device Profiles
 * Save/restore EQ, effects and mode settings per output device.
 * Auto-switch when output route changes (where detectable).
 * Never infers an exact model from a generic Bluetooth name.
 * Credits: Arunaksha Das
 */

import { getState, saveState, snapshotProfile, applyProfile } from './state.js';
import { toast } from './ui.js';

/**
 * Output types: 'speaker' | 'wired' | 'bt:<deviceName>' | 'soundbar'
 */

/* ── Profile CRUD ── */

/**
 * Save the current audio settings as a profile for the given output.
 * @param {string} profileId  e.g. 'speaker', 'wired', 'bt:WH-1000XM4'
 * @param {string} displayName  Human-readable name
 */
export function saveProfile(profileId, displayName) {
  const s = getState();
  s.profiles[profileId] = {
    name: displayName,
    outputType: profileId.startsWith('bt:') ? 'bluetooth' : profileId,
    created: Date.now(),
    ...snapshotProfile()
  };
  s.activeProfileId = profileId;
  saveState();
  toast(`Profile "${displayName}" saved`, 'success');
}

/**
 * Load a profile by its ID.
 * @returns {boolean} true if profile was found and applied
 */
export function loadProfile(profileId) {
  const s = getState();
  const profile = s.profiles[profileId];
  if (!profile) return false;
  applyProfile(profile);
  s.activeProfileId = profileId;
  saveState();
  toast(`Switched to "${profile.name}"`, 'info');
  return true;
}

/**
 * Delete a profile.
 */
export function deleteProfile(profileId) {
  const s = getState();
  const name = s.profiles[profileId]?.name || profileId;
  delete s.profiles[profileId];
  if (s.activeProfileId === profileId) s.activeProfileId = '_default';
  saveState();
  toast(`Profile "${name}" deleted`, 'info');
}

/**
 * Rename a profile.
 */
export function renameProfile(profileId, newName) {
  const s = getState();
  if (s.profiles[profileId]) {
    s.profiles[profileId].name = newName;
    saveState();
  }
}

/**
 * List all profiles.
 * @returns {Array<{id: string, name: string, outputType: string}>}
 */
export function listProfiles() {
  const s = getState();
  return Object.entries(s.profiles).map(([id, p]) => ({
    id,
    name:       p.name,
    outputType: p.outputType,
    active:     s.activeProfileId === id
  }));
}

/* ── Output route detection ── */

let _lastRoute = null;
let _routeListener = null;

/**
 * Get the current output route.
 * Uses Web Audio API's sinkId or falls back to heuristics.
 * @returns {string} profile ID for the current output
 */
export function detectOutputRoute() {
  // On web, we can't reliably detect Bluetooth device names without
  // the Web Bluetooth API (which requires user gesture and HTTPS).
  // We can detect if audio output has changed via navigator.mediaDevices.
  return _lastRoute || 'speaker';
}

/**
 * Start monitoring output route changes.
 * On browsers that support it, uses devicechange event.
 * @param {function} callback - Called with new profileId when route changes
 */
export function startRouteMonitoring(callback) {
  if (!navigator.mediaDevices) return;

  _routeListener = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');

      // Try to identify the active output
      let routeId = 'speaker';
      for (const dev of outputs) {
        const label = dev.label.toLowerCase();
        if (dev.deviceId === 'default') continue;

        if (label.includes('bluetooth') || label.includes('bt')) {
          // Use the device label as the profile key
          // Never infer exact model from generic name
          routeId = 'bt:' + dev.label;
          break;
        } else if (label.includes('wired') || label.includes('headphone') || label.includes('headset')) {
          routeId = 'wired';
          break;
        } else if (label.includes('usb')) {
          routeId = 'usb';
          break;
        }
      }

      if (routeId !== _lastRoute) {
        _lastRoute = routeId;
        // Auto-switch if we have a profile for this output
        const s = getState();
        if (s.profiles[routeId]) {
          loadProfile(routeId);
          if (callback) callback(routeId);
        }
      }
    } catch (e) {
      console.warn('[profiles] Route detection failed:', e);
    }
  };

  navigator.mediaDevices.addEventListener('devicechange', _routeListener);

  // Initial detection
  _routeListener();
}

/**
 * Stop monitoring output route changes.
 */
export function stopRouteMonitoring() {
  if (_routeListener && navigator.mediaDevices) {
    navigator.mediaDevices.removeEventListener('devicechange', _routeListener);
    _routeListener = null;
  }
}

/**
 * Get a list of available audio outputs (where supported).
 * @returns {Promise<Array<{id: string, label: string}>>}
 */
export async function getAvailableOutputs() {
  if (!navigator.mediaDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(d => d.kind === 'audiooutput')
      .map(d => ({ id: d.deviceId, label: d.label || 'Unknown output' }));
  } catch (e) {
    return [];
  }
}
