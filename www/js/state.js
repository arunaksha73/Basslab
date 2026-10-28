/**
 * BassLab 3D — State Management
 * Versioned local schema with migration support.
 * Credits: Arunaksha Das
 */

const SCHEMA_VERSION = 2;

/* ── Data definitions ── */

export const MODES = {
  Movie:  { icon: 'movie',  desc: 'Balanced bass with optional spatial ambience.',           gains: [3,2,1,0,0,0,1,2,2,1] },
  Music:  { icon: 'music',  desc: 'Natural tonal balance and stereo presentation.',          gains: [1,1,0,0,0,0,0,1,1,1] },
  Voice:  { icon: 'voice',  desc: 'Vocal clarity with controlled low frequencies.',          gains: [-3,-2,-1,1,3,3,2,0,0,0] },
  Game:   { icon: 'game',   desc: 'Wider stereo and added detail.',                          gains: [1,1,0,-1,0,1,2,3,2,1] },
  Sport:  { icon: 'sport',  desc: 'Speech intelligibility and balanced sound.',              gains: [-1,0,0,1,2,2,1,0,0,0] },
  Night:  { icon: 'night',  desc: 'Reduced dynamic variation for quiet listening.',          gains: [-2,-1,0,0,0,0,0,0,-1,-2] }
};

export const ADV_PRESETS = {
  'Bass Beast': [6,5,3,1,0,0,0,0,1,1],
  'Deep Sub':   [7,5,2,0,-1,0,0,0,0,0],
  'Cinema 3D':  [3,2,1,0,0,0,1,2,3,3],
  'Vocal Pro':  [-2,-1,0,2,3,3,2,1,0,0],
  'EDM':        [5,4,1,0,-1,1,2,3,4,3],
  'Acoustic':   [1,1,0,1,1,1,2,1,1,0]
};

export const EXTRA_PRESETS = {
  'Flat':            [0,0,0,0,0,0,0,0,0,0],
  'Bass Boost':      [6,5,3,1,0,0,0,0,0,0],
  'Phone Speaker':   [6,5,3,1,0,0,0,-1,-2,-2],
  'Vocal Clarity':   [-3,-2,-1,1,3,3,2,0,0,0],
  'Night Listening': [-2,-1,0,0,0,0,0,0,-1,-2]
};

export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_LABELS      = ['31','62','125','250','500','1K','2K','4K','8K','16K'];

export const EFFECTS_LIST = [
  { name: '3D Spatial',       icon: 'cube' },
  { name: '8D Panning',       icon: 'ring' },
  { name: 'Bass Boost',       icon: 'bass' },
  { name: 'Virtual Surround', icon: 'ring' },
  { name: 'Loudness',         icon: 'vol'  },
  { name: 'Night Mode',       icon: 'night'},
  { name: 'Dialogue',         icon: 'mic'  },
  { name: 'Stereo Wide',      icon: 'wave' }
];

export const FX_SLIDERS = [
  { name: 'Bass intensity',    defaultVal: 60  },
  { name: 'Spatial intensity',  defaultVal: 50  },
  { name: 'Reverb / room',     defaultVal: 30  }
];

export const SOURCES   = ['Bluetooth', 'AUX', 'USB', 'HDMI (ARC)'];
export const VIZ_STYLES = ['Bars', 'Wave', 'Circle', 'Particles'];

/* ── Default state (v2) ── */

const DEFAULT_STATE = {
  _version: SCHEMA_VERSION,

  /* Audio */
  mode:    'Movie',
  gains:   [0,0,0,0,0,0,0,0,0,0],
  pre:     0,
  preset:  'Flat',
  fx:      {},
  fxv:     { 'Bass intensity': 60, 'Spatial intensity': 50, 'Reverb / room': 30 },
  eqEnabled:          true,
  processingEnabled:  true,
  parametricFilters: [
    { type: 'lowshelf', freq: 80,   gain: 0,  q: 0.7 },
    { type: 'peaking',  freq: 1000, gain: -2, q: 1.2 }
  ],

  /* Profiles */
  profiles:        {},          // { profileId: { name, outputType, gains, pre, mode, preset, fx, fxv } }
  activeProfileId: '_default',

  /* Presets */
  customPresets: {},            // { name: { gains, pre, fx, fxv, mode } }

  /* Per-song EQ */
  perSongEQ: {},                // { "artist – title": presetName }

  /* Headphone correction */
  headphoneCorrection: null,    // headphone model key or null

  /* Player */
  playerRepeat:  'off',         // 'off' | 'all' | 'one'
  playerShuffle: false,

  /* Sleep timer (minutes remaining, null = off) */
  sleepTimer: null,

  /* A/B compare */
  abCompareActive: false,

  /* Device / connection */
  src: null,
  vol: 40,

  /* UI */
  dark:             false,
  keepScreenOn:     false,
  hapticFeedback:   true,
  mediaIntegration: false,
  rememberLastMode: true,
  safetyWarnings:   true,
  vizStyle:         0,
  animEnabled:      true,

  /* Open model */
  donationLinkEnabled: false
};

/* ── Migrations ── */

const MIGRATIONS = {
  1(data) {
    // v1 → v2: original flat schema to versioned
    return {
      ...DEFAULT_STATE,
      mode:   data.mode   || 'Movie',
      gains:  Array.isArray(data.gains) ? data.gains.slice() : DEFAULT_STATE.gains.slice(),
      dark:   !!data.dark,
      vol:    typeof data.vol === 'number' ? data.vol : 40,
      pre:    typeof data.pre === 'number' ? data.pre : 0,
      preset: data.preset || 'Flat',
      fx:     data.fx  || {},
      fxv:    data.fxv || { ...DEFAULT_STATE.fxv },
      src:    data.src || null,
      _version: 2
    };
  }
};

function migrate(data) {
  let version = data._version || 1;
  while (version < SCHEMA_VERSION) {
    const fn = MIGRATIONS[version];
    if (!fn) {
      console.warn(`[state] No migration from v${version}, resetting`);
      return { ...DEFAULT_STATE };
    }
    data = fn(data);
    version = data._version;
  }
  return data;
}

/* ── State singleton ── */

let S = null;

export function loadState() {
  try {
    const raw = localStorage.getItem('bl3d');
    if (raw) {
      S = { ...DEFAULT_STATE, ...migrate(JSON.parse(raw)) };
    } else {
      S = { ...DEFAULT_STATE };
    }
  } catch (e) {
    console.warn('[state] Load failed, using defaults:', e);
    S = { ...DEFAULT_STATE };
  }
  return S;
}

export function saveState() {
  try {
    localStorage.setItem('bl3d', JSON.stringify(S));
  } catch (e) {
    console.warn('[state] Save failed:', e);
  }
}

export function resetState() {
  try { localStorage.removeItem('bl3d'); } catch (e) { /* ignore */ }
  S = { ...DEFAULT_STATE };
  return S;
}

export function getState() {
  if (!S) return loadState();
  return S;
}

export function getDefaultState() {
  return { ...DEFAULT_STATE };
}

/**
 * Returns a serialisable snapshot of the current audio profile.
 * Used for per-device profiles and preset export.
 */
export function snapshotProfile() {
  const s = getState();
  return {
    mode:   s.mode,
    gains:  s.gains.slice(),
    pre:    s.pre,
    preset: s.preset,
    fx:     { ...s.fx },
    fxv:    { ...s.fxv },
    eqEnabled:         s.eqEnabled,
    processingEnabled: s.processingEnabled,
    parametricFilters: s.parametricFilters.map(f => ({ ...f }))
  };
}

/**
 * Applies a profile snapshot to the current state (does not save).
 */
export function applyProfile(profile) {
  const s = getState();
  if (profile.mode   !== undefined) s.mode   = profile.mode;
  if (profile.gains  !== undefined) s.gains  = profile.gains.slice();
  if (profile.pre    !== undefined) s.pre    = profile.pre;
  if (profile.preset !== undefined) s.preset = profile.preset;
  if (profile.fx     !== undefined) s.fx     = { ...profile.fx };
  if (profile.fxv    !== undefined) s.fxv    = { ...profile.fxv };
  if (profile.eqEnabled         !== undefined) s.eqEnabled         = profile.eqEnabled;
  if (profile.processingEnabled !== undefined) s.processingEnabled = profile.processingEnabled;
  if (profile.parametricFilters !== undefined) s.parametricFilters = profile.parametricFilters.map(f => ({ ...f }));
}
