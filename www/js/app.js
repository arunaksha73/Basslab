/**
 * BassLab 3D — Main Application Entry
 * Wires together all modules: state, router, audio engine, player,
 * profiles, persistence, test tools. Renders all screen UIs.
 * Credits: Arunaksha Das
 */

import {
  getState, saveState, resetState, loadState,
  MODES, ADV_PRESETS, EXTRA_PRESETS,
  EQ_FREQUENCIES, EQ_LABELS, EFFECTS_LIST, FX_SLIDERS,
  SOURCES, VIZ_STYLES, snapshotProfile, applyProfile
} from './state.js';

import { $, $$, ic, renderIcons, toast, createSwitch, triggerHaptic } from './ui.js';
import { initRouter, go, setNavCallback, currentScreen } from './router.js';
import engine from './audio-engine.js';
import * as persistence from './persistence.js';
import * as profiles from './profiles.js';
import * as testTools from './test-tools.js';
import * as playerMod from './player.js';

/* ────────────────────────────────────────────────
   State
   ──────────────────────────────────────────────── */

const S = loadState();

function save() { saveState(); }

/* ────────────────────────────────────────────────
   Audio engine bootstrap (on first user gesture)
   ──────────────────────────────────────────────── */

let engineReady = false;

async function ensureEngine() {
  if (engineReady) { await engine.resume(); return; }
  await engine.init();
  engineReady = true;

  // Apply current state to engine
  syncEngineState();

  // Update status badge
  renderProcessingStatus();
}

function syncEngineState() {
  if (!engineReady) return;
  engine.applyEQ(S.gains, S.pre);
  engine.setEQEnabled(S.eqEnabled);
  engine.applyParametric(S.parametricFilters);
  engine.applyEffects(S.fx, S.fxv);
  engine.setProcessingEnabled(S.processingEnabled);
  engine.updateAutoGain();
}

/* ────────────────────────────────────────────────
   Navigation callback
   ──────────────────────────────────────────────── */

setNavCallback(id => {
  if (id === 'viz')    startViz();
  else                 stopViz();
  if (id === 'player') renderPlayerScreen();
});

/* ────────────────────────────────────────────────
   Sound Modes
   ──────────────────────────────────────────────── */

let sel = S.mode;

function renderModes() {
  // Home quick tiles
  $('#quick').innerHTML = Object.keys(MODES).map(k =>
    `<button class="tile" aria-pressed="${S.mode === k}" data-m="${k}">${ic(MODES[k].icon)}${k}</button>`
  ).join('');

  // Modes screen
  if ($('#mg')) {
    $('#mg').innerHTML = Object.keys(MODES).map(k =>
      `<button class="tile" aria-pressed="${sel === k}" data-s="${k}">${ic(MODES[k].icon)}${k}</button>`
    ).join('');
  }
  if ($('#mt')) $('#mt').textContent = sel + ' mode';
  if ($('#md')) $('#md').textContent = MODES[sel] ? MODES[sel].desc : 'Advanced preset: adjusts the equalizer curve.';

  if ($('#adv')) {
    $('#adv').innerHTML = Object.keys(ADV_PRESETS).map(k =>
      `<button class="tile" aria-pressed="${sel === k}" data-s="${k}">${ic('bass')}${k}</button>`
    ).join('');
  }
}

function applyCurve(name, arr) {
  S.mode = name; S.preset = name; S.gains = arr.slice();
  save(); renderModes(); renderEQ();
  if (engineReady) {
    engine.applyEQ(S.gains, S.pre);
    engine.updateAutoGain();
  }
}

$('#quick').addEventListener('click', e => {
  const b = e.target.closest('[data-m]');
  if (b) { sel = b.dataset.m; applyCurve(sel, MODES[sel].gains); ensureEngine(); }
});
$('#mg').addEventListener('click', e => {
  const b = e.target.closest('[data-s]'); if (b) { sel = b.dataset.s; renderModes(); }
});
$('#adv').addEventListener('click', e => {
  const b = e.target.closest('[data-s]'); if (b) { sel = b.dataset.s; renderModes(); }
});
$('#apply').addEventListener('click', () => {
  const arr = (MODES[sel] ? MODES[sel].gains : ADV_PRESETS[sel]) || [0,0,0,0,0,0,0,0,0,0];
  applyCurve(sel, arr);
  ensureEngine();
});

/* ────────────────────────────────────────────────
   Volume
   ──────────────────────────────────────────────── */

function vol() { $('#vol').value = S.vol; $('#volv').textContent = S.vol; }
$('#vol').addEventListener('input', function() { S.vol = +this.value; $('#volv').textContent = S.vol; save(); });
$('#mute').addEventListener('click', function() {
  const m = this.getAttribute('aria-pressed') !== 'true';
  this.setAttribute('aria-pressed', m);
  $('#vol').disabled = m;
});

/* ────────────────────────────────────────────────
   Equalizer
   ──────────────────────────────────────────────── */

$('#fl').innerHTML = EQ_LABELS.map(f => `<span>${f}</span>`).join('');
$('#bands').innerHTML = EQ_LABELS.map((f, i) =>
  `<label><output id="o${i}"></output><input type="range" min="-12" max="12" step="1" data-b="${i}" aria-label="${f} Hz gain"></label>`
).join('');

function renderEQ() {
  S.gains.forEach((g, i) => {
    const r = document.querySelector(`[data-b="${i}"]`); if (r) r.value = g;
    const o = $(`#o${i}`); if (o) o.textContent = (g > 0 ? '+' : '') + g;
  });

  // Curve SVG
  const P = S.gains.map((g, i) => [20 + i * 320 / 9, 55 - (g + S.pre) * 3.8]);
  let d = `M${P[0][0]} ${P[0][1]}`;
  for (let i = 1; i < P.length; i++) {
    const mx = (P[i - 1][0] + P[i][0]) / 2;
    d += ` C${mx} ${P[i - 1][1]} ${mx} ${P[i][1]} ${P[i][0]} ${P[i][1]}`;
  }
  $('#curve').innerHTML =
    `<line x1="0" y1="55" x2="360" y2="55" stroke="var(--d)"/>` +
    `<path d="${d} L340 110 L20 110Z" fill="var(--p)" opacity=".12"/>` +
    `<path d="${d}" fill="none" stroke="var(--p)" stroke-width="2.5"/>` +
    P.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#fff" stroke="var(--p)" stroke-width="2"/>`).join('');

  $('#prev').textContent = S.pre + ' dB'; $('#pre').value = S.pre;

  // Presets chips
  const names = persistence.getAllPresetNames();
  $('#presets').innerHTML = names.map(n =>
    `<button class="chip" aria-pressed="${S.preset === n}" data-p="${n}">${n}</button>`
  ).join('') +
  `<button class="chip chip-add" data-p="_save">+ Save current</button>`;

  // Safety indicator
  renderSafetyIndicator();
}

$('#bands').addEventListener('input', e => {
  const i = +e.target.dataset.b;
  S.gains[i] = +e.target.value; S.preset = 'Custom'; save(); renderEQ();
  if (engineReady) engine.applyEQ(S.gains, S.pre);
});

$('#pre').addEventListener('input', function() {
  S.pre = +this.value; save(); renderEQ();
  if (engineReady) engine.applyEQ(S.gains, S.pre);
});

$('#presets').addEventListener('click', e => {
  const b = e.target.closest('[data-p]'); if (!b) return;
  const n = b.dataset.p;
  if (n === '_save') {
    const name = prompt('Preset name:');
    if (name && name.trim()) {
      persistence.saveCustomPreset(name.trim());
      renderEQ();
    }
    return;
  }
  const gains = EXTRA_PRESETS[n] || ADV_PRESETS[n] || (S.customPresets[n] && S.customPresets[n].gains);
  if (gains) {
    S.gains = gains.slice(); S.preset = n; save(); renderEQ();
    if (S.customPresets[n]) applyProfile(S.customPresets[n]);
    if (engineReady) { engine.applyEQ(S.gains, S.pre); engine.updateAutoGain(); }
  }
});

$('#flat').addEventListener('click', () => {
  S.gains = EXTRA_PRESETS.Flat.slice(); S.pre = 0; S.preset = 'Flat'; save(); renderEQ();
  if (engineReady) engine.applyEQ(S.gains, S.pre);
});

$('#eqOn').addEventListener('change', function() {
  S.eqEnabled = this.checked;
  save();
  $('#tg').style.opacity = this.checked ? 1 : 0.4;
  if (engineReady) engine.setEQEnabled(this.checked);
});

$$('[data-tab]').forEach(b => b.addEventListener('click', function() {
  $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  $('#tg').hidden = b.dataset.tab !== 'g';
  $('#tp').hidden = b.dataset.tab !== 'p';
}));

/* Parametric EQ */
let F = S.parametricFilters.map(f => [f.type, f.freq, f.gain, f.q]);

function renderF() {
  $('#pfs').innerHTML =
    `<div class="pf sub"><span>Freq (Hz)</span><span>Gain (dB)</span><span>Q</span></div>` +
    F.map((f, i) =>
      `<div class="pf"><input type="number" value="${f[1]}" data-pf="${i}" data-pfc="f" aria-label="Frequency"><input type="number" value="${f[2]}" data-pf="${i}" data-pfc="g" aria-label="Gain"><span style="display:flex;gap:6px"><input type="number" value="${f[3]}" step="0.1" data-pf="${i}" data-pfc="q" aria-label="Q"><button class="ib" data-rm="${i}" aria-label="Remove filter" style="width:36px;height:36px">✕</button></span></div>`
    ).join('');
}

$('#pfs').addEventListener('click', e => {
  const r = e.target.closest('[data-rm]');
  if (r) { F.splice(+r.dataset.rm, 1); updateParametric(); renderF(); }
});

$('#pfs').addEventListener('input', e => {
  const idx = e.target.dataset.pf;
  const col = e.target.dataset.pfc;
  if (idx === undefined) return;
  const i = +idx;
  if (col === 'f') F[i][1] = +e.target.value;
  if (col === 'g') F[i][2] = +e.target.value;
  if (col === 'q') F[i][3] = +e.target.value;
  updateParametric();
});

$('#addf').addEventListener('click', () => {
  if (F.length < 8) { F.push(['peaking', 2000, 0, 1]); updateParametric(); renderF(); }
});

function updateParametric() {
  S.parametricFilters = F.map(f => ({ type: f[0], freq: f[1], gain: f[2], q: f[3] }));
  save();
  if (engineReady) engine.applyParametric(S.parametricFilters);
}

/* ────────────────────────────────────────────────
   Effects
   ──────────────────────────────────────────────── */

$('#fxg').innerHTML = EFFECTS_LIST.map(f =>
  `<button class="tile" aria-pressed="${!!S.fx[f.name]}" data-f="${f.name}">${ic(f.icon)}${f.name}</button>`
).join('');

$('#fxg').addEventListener('click', e => {
  const b = e.target.closest('[data-f]'); if (!b) return;
  const k = b.dataset.f; S.fx[k] = !S.fx[k]; b.setAttribute('aria-pressed', !!S.fx[k]); save();
  if (engineReady) engine.applyEffects(S.fx, S.fxv);
  ensureEngine();
});

$('#fxs').innerHTML = FX_SLIDERS.map(s =>
  `<div class="row"><span style="width:112px;flex:none;font-size:14px">${s.name}</span><input type="range" min="0" max="100" value="${S.fxv[s.name] != null ? S.fxv[s.name] : s.defaultVal}" data-sl="${s.name}" aria-label="${s.name}"><span class="v">${S.fxv[s.name] != null ? S.fxv[s.name] : s.defaultVal}</span></div>`
).join('');

$('#fxs').addEventListener('input', e => {
  const k = e.target.dataset.sl; if (!k) return;
  S.fxv[k] = +e.target.value; e.target.nextElementSibling.textContent = e.target.value; save();
  if (engineReady) engine.applyEffects(S.fx, S.fxv);
});

/* ────────────────────────────────────────────────
   A/B Compare (persistent floating button)
   ──────────────────────────────────────────────── */

$('#abBtn').addEventListener('click', async () => {
  await ensureEngine();
  const bypassed = engine.toggleABCompare();
  S.abCompareActive = bypassed; save();
  const btn = $('#abBtn');
  btn.classList.toggle('ab-active', bypassed);
  btn.setAttribute('aria-pressed', bypassed);
  btn.title = bypassed ? 'B: Bypass (flat)' : 'A: Processed';
  toast(bypassed ? 'A/B: Bypass (flat, loudness-matched)' : 'A/B: Processing active', 'info');
});

/* ────────────────────────────────────────────────
   Safety Indicator
   ──────────────────────────────────────────────── */

function renderSafetyIndicator() {
  const indicator = $('#safety');
  if (!indicator) return;

  // Calculate estimated peak boost
  let maxBoost = Math.max(S.pre, 0);
  S.gains.forEach(g => { if (g > 0) maxBoost += g; });
  const avgBoost = maxBoost / (S.gains.filter(g => g > 0).length || 1);
  const totalEstimate = avgBoost + S.pre;

  if (totalEstimate > 9) {
    indicator.className = 'safety-indicator safety-danger';
    indicator.innerHTML = `${ic('warn')}<span>High clipping risk: ~${totalEstimate.toFixed(0)} dB combined boost</span>`;
    indicator.hidden = false;
  } else if (totalEstimate > 4) {
    indicator.className = 'safety-indicator safety-warn';
    indicator.innerHTML = `${ic('warn')}<span>Moderate boost: ~${totalEstimate.toFixed(0)} dB — limiter is active</span>`;
    indicator.hidden = false;
  } else {
    indicator.hidden = true;
  }
}

// Live peak meter (updates during playback)
let peakMeterRAF = 0;
function updatePeakMeter() {
  const status = engine.getStatus();
  const meter = $('#peakMeter');
  if (meter && status.active) {
    const pct = Math.max(0, Math.min(100, (status.peakLevel + 60) / 60 * 100));
    meter.style.setProperty('--peak', pct + '%');
    meter.classList.toggle('clipping', status.clipping);
    if (status.clipping) {
      meter.querySelector('.peak-val').textContent = 'CLIP';
    } else {
      meter.querySelector('.peak-val').textContent =
        status.peakLevel > -60 ? status.peakLevel.toFixed(1) + ' dB' : '–∞ dB';
    }
  }
  peakMeterRAF = requestAnimationFrame(updatePeakMeter);
}

/* ────────────────────────────────────────────────
   Device screen
   ──────────────────────────────────────────────── */

function renderSrc() {
  $('#src').innerHTML = SOURCES.map((s, i) =>
    `<div class="row" role="radio" tabindex="0" aria-checked="${S.src === s || (!S.src && i === 0)}" data-src="${s}"><span>${s}</span><span class="badge">${(S.src === s || (!S.src && i === 0)) ? 'Selected' : ''}</span></div>`
  ).join('');
}
$('#src').addEventListener('click', e => {
  const r = e.target.closest('[data-src]');
  if (r) { S.src = r.dataset.src; save(); renderSrc(); }
});

/* ────────────────────────────────────────────────
   Profiles UI
   ──────────────────────────────────────────────── */

function renderProfiles() {
  const list = profiles.listProfiles();
  const container = $('#profileList');
  if (!container) return;

  container.innerHTML = list.length === 0
    ? `<div class="sub" style="padding:12px">No saved profiles yet. Save your current settings for a specific output device.</div>`
    : list.map(p =>
        `<div class="row" data-pid="${p.id}">
          <span style="flex:1"><b>${p.name}</b><br><span class="sub">${p.outputType}</span></span>
          ${p.active ? '<span class="badge" style="background:var(--p);color:#fff">Active</span>' : ''}
          <button class="ib" data-load-p="${p.id}" aria-label="Load profile">${ic('check')}</button>
          <button class="ib" data-del-p="${p.id}" aria-label="Delete profile">${ic('x')}</button>
        </div>`
      ).join('');
}

$('#profileList')?.addEventListener('click', e => {
  const load = e.target.closest('[data-load-p]');
  if (load) {
    profiles.loadProfile(load.dataset.loadP);
    renderProfiles(); renderEQ(); renderModes();
    syncEngineState();
    return;
  }
  const del = e.target.closest('[data-del-p]');
  if (del) {
    profiles.deleteProfile(del.dataset.delP);
    renderProfiles();
  }
});

$('#saveProfile')?.addEventListener('click', () => {
  const name = prompt('Profile name (e.g. "My headphones"):');
  if (!name || !name.trim()) return;
  const id = 'custom:' + name.trim().toLowerCase().replace(/\s+/g, '-');
  profiles.saveProfile(id, name.trim());
  renderProfiles();
});

/* ────────────────────────────────────────────────
   Player Screen
   ──────────────────────────────────────────────── */

function renderPlayerScreen() {
  const ps = playerMod.getPlayerState();
  const track = ps.track;

  // Track info
  const trackInfo = $('#playerTrackInfo');
  if (trackInfo) {
    if (track) {
      trackInfo.innerHTML = `<b class="player-title">${track.title}</b><div class="sub">${track.artist || 'Unknown artist'}</div>`;
    } else {
      trackInfo.innerHTML = `<b class="player-title">No track loaded</b><div class="sub">Add music files to start playing</div>`;
    }
  }

  // Progress bar
  const prog = $('#playerProgress');
  if (prog) {
    prog.value = ps.currentTime;
    prog.max   = ps.duration || 0;
  }
  const timeEl = $('#playerTime');
  if (timeEl) {
    timeEl.textContent = `${playerMod.formatTime(ps.currentTime)} / ${playerMod.formatTime(ps.duration)}`;
  }

  // Play/pause button
  const ppBtn = $('#ppBtn');
  if (ppBtn) {
    ppBtn.innerHTML = ic(ps.isPlaying ? 'pause' : 'play');
    ppBtn.setAttribute('aria-label', ps.isPlaying ? 'Pause' : 'Play');
  }

  // Shuffle / repeat icons
  const shBtn = $('#shBtn');
  if (shBtn) {
    shBtn.classList.toggle('active-ctrl', ps.shuffle);
    shBtn.setAttribute('aria-pressed', ps.shuffle);
  }
  const rpBtn = $('#rpBtn');
  if (rpBtn) {
    rpBtn.classList.toggle('active-ctrl', ps.repeat !== 'off');
    rpBtn.setAttribute('aria-pressed', ps.repeat !== 'off');
    if (ps.repeat === 'one') rpBtn.innerHTML = ic('repeat') + '<small>1</small>';
    else rpBtn.innerHTML = ic('repeat');
  }

  // Queue
  const queueEl = $('#playerQueue');
  if (queueEl) {
    const queue = playerMod.getQueue();
    queueEl.innerHTML = queue.length === 0
      ? `<div class="sub" style="padding:16px;text-align:center">Queue is empty. Add files to start playing.</div>`
      : queue.map((q, i) =>
          `<div class="row queue-item${i === ps.currentIdx ? ' queue-active' : ''}" data-qi="${i}">
            <span style="flex:1;overflow:hidden"><b style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${q.title}</b><span class="sub">${q.artist || 'Unknown'} · ${playerMod.formatTime(q.duration)}</span></span>
            <button class="ib" data-qrm="${i}" aria-label="Remove" style="width:36px;height:36px">✕</button>
          </div>`
        ).join('');
  }

  // Sleep timer display
  const sleepEl = $('#sleepDisplay');
  if (sleepEl) {
    const rem = playerMod.getSleepTimerRemaining();
    if (rem !== null) {
      sleepEl.textContent = `Sleep: ${playerMod.formatTime(rem)}`;
      sleepEl.hidden = false;
    } else {
      sleepEl.hidden = true;
    }
  }
}

// Player event listeners
$('#addFiles')?.addEventListener('click', async () => {
  await ensureEngine();
  await playerMod.pickFiles();
});
$('#ppBtn')?.addEventListener('click', async () => {
  await ensureEngine();
  playerMod.togglePlayPause();
});
$('#nextBtn')?.addEventListener('click', () => playerMod.next());
$('#prevBtn')?.addEventListener('click', () => playerMod.prev());
$('#shBtn')?.addEventListener('click', () => playerMod.toggleShuffle());
$('#rpBtn')?.addEventListener('click', () => playerMod.cycleRepeat());
$('#clearQueue')?.addEventListener('click', () => {
  if (confirm('Clear the entire queue?')) playerMod.clearQueue();
});
$('#playerProgress')?.addEventListener('input', function() {
  playerMod.seek(+this.value);
});

// Queue item interactions
$('#playerQueue')?.addEventListener('click', e => {
  const rm = e.target.closest('[data-qrm]');
  if (rm) { playerMod.removeFromQueue(+rm.dataset.qrm); return; }
  const qi = e.target.closest('[data-qi]');
  if (qi) {
    ensureEngine().then(() => playerMod.playTrack(+qi.dataset.qi));
  }
});

// Sleep timer controls
$('#sleepTimerBtn')?.addEventListener('click', () => {
  const current = playerMod.getSleepTimerRemaining();
  if (current !== null) {
    playerMod.clearSleepTimer();
    toast('Sleep timer cancelled', 'info');
  } else {
    const m = prompt('Sleep timer (minutes):', '30');
    if (m && +m > 0) playerMod.startSleepTimer(+m);
  }
});

// Subscribe to player state changes
playerMod.onPlayerChange(() => renderPlayerScreen());

/* ────────────────────────────────────────────────
   Test Tools
   ──────────────────────────────────────────────── */

$('#testSweep')?.addEventListener('click', async () => {
  await ensureEngine();
  const btn = $('#testSweep');
  if (testTools.isTestPlaying()) { testTools.stopTest(); btn.textContent = 'Frequency Sweep'; return; }
  btn.textContent = 'Stop Sweep';
  testTools.playSweep(20, 20000, 10, (p, f) => {
    const prog = $('#sweepProgress');
    if (prog) prog.style.width = (p * 100) + '%';
    const lbl = $('#sweepFreq');
    if (lbl) lbl.textContent = p < 1 ? Math.round(f) + ' Hz' : 'Done';
    if (p >= 1) btn.textContent = 'Frequency Sweep';
  });
});

$('#testPink')?.addEventListener('click', async () => {
  await ensureEngine();
  const btn = $('#testPink');
  if (testTools.isTestPlaying()) { testTools.stopTest(); btn.textContent = 'Pink Noise'; return; }
  btn.textContent = 'Stop Noise';
  testTools.playPinkNoise(10);
  setTimeout(() => { btn.textContent = 'Pink Noise'; }, 10500);
});

$('#testLR')?.addEventListener('click', async () => {
  await ensureEngine();
  const btn = $('#testLR');
  if (testTools.isTestPlaying()) { testTools.stopTest(); btn.textContent = 'L/R Balance'; return; }
  btn.textContent = 'Playing...';
  testTools.playBalanceTest(2, 8, side => {
    const lbl = $('#lrSide');
    if (side === 'done') {
      btn.textContent = 'L/R Balance';
      if (lbl) lbl.textContent = '';
    } else if (lbl) {
      lbl.textContent = side === 'left' ? '◀ LEFT' : 'RIGHT ▶';
      lbl.className = 'lr-label lr-' + side;
    }
  });
});

$('#testStop')?.addEventListener('click', () => {
  testTools.stopTest();
  const btns = ['testSweep', 'testPink', 'testLR'];
  btns.forEach(id => {
    const el = $(`#${id}`);
    if (el) el.textContent = el.dataset.label || el.textContent;
  });
});

/* ────────────────────────────────────────────────
   Visualizer
   ──────────────────────────────────────────────── */

let vi = S.vizStyle, raf = 0;
const cv = $('#cv'), cx = cv ? cv.getContext('2d') : null;

if ($('#vs')) {
  $('#vs').innerHTML = VIZ_STYLES.map((v, i) =>
    `<button class="chip" aria-pressed="${i === vi}" data-v="${i}">${v}</button>`
  ).join('');
  $('#vs').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    vi = +b.dataset.v; S.vizStyle = vi; save();
    $$('#vs .chip').forEach(c => c.setAttribute('aria-pressed', c === b));
  });
}

function frame(t) {
  if (!cv || !cx) return;
  const w = cv.width = cv.clientWidth * devicePixelRatio;
  const h = cv.height = cv.clientHeight * devicePixelRatio;
  const p = '#7027D8';
  cx.clearRect(0, 0, w, h);
  cx.fillStyle = p; cx.strokeStyle = p; cx.lineWidth = 3 * devicePixelRatio;

  // Try to use real audio data from engine
  const freqData = engine.getFrequencyData();
  const useReal  = freqData && freqData.some(v => v > 0);

  function a(i) {
    if (useReal) {
      const idx = Math.floor((i / 32) * freqData.length * 0.5);
      return freqData[idx] / 255;
    }
    return 0.5 + 0.5 * Math.sin(t / 300 + i * 0.6) * Math.sin(t / 700 + i * 0.3);
  }

  const N = 32;
  if (vi === 0) {
    for (let i = 0; i < N; i++) {
      const bh = a(i) * h * 0.8 + 4;
      cx.fillRect(i * w / N + 3, h - bh, w / N - 6, bh);
    }
  } else if (vi === 1) {
    cx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const y = h / 2 + Math.sin(i * 0.2 + t / 200) * h * 0.25 * a(i / 4);
      i ? cx.lineTo(i * w / 120, y) : cx.moveTo(0, y);
    }
    cx.stroke();
  } else if (vi === 2) {
    for (let i = 0; i < 64; i++) {
      const an = i / 64 * 6.283, r = h * 0.22, l = a(i / 2) * h * 0.2 + 4;
      cx.beginPath();
      cx.moveTo(w / 2 + Math.cos(an) * r, h / 2 + Math.sin(an) * r);
      cx.lineTo(w / 2 + Math.cos(an) * (r + l), h / 2 + Math.sin(an) * (r + l));
      cx.stroke();
    }
  } else {
    for (let i = 0; i < 60; i++) {
      const x = (i * 97 % 100) / 100 * w;
      const y2 = ((i * 53 + t / 20 * (1 + i % 3)) % 100) / 100 * h;
      cx.globalAlpha = 0.3 + a(i) * 0.7;
      cx.beginPath();
      cx.arc(x, y2, (2 + a(i) * 5) * devicePixelRatio, 0, 6.283);
      cx.fill();
    }
    cx.globalAlpha = 1;
  }

  if ($('#anim')?.checked) raf = requestAnimationFrame(frame);
}

function startViz() { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
function stopViz()  { cancelAnimationFrame(raf); }
$('#anim')?.addEventListener('change', startViz);

/* ────────────────────────────────────────────────
   Settings
   ──────────────────────────────────────────────── */

function theme() {
  document.documentElement.dataset.theme = S.dark ? 'dark' : 'light';
  $('#dark').checked = S.dark;
  const metaTheme = $('#metaThemeColor');
  if (metaTheme) metaTheme.setAttribute('content', S.dark ? '#12121a' : '#7027D8');
}

/* Pause visualizer animation on mobile background to save battery */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    stopViz();
  } else if (currentScreen() === 'viz') {
    startViz();
  }
});

$('#dark').addEventListener('change', function() { S.dark = this.checked; theme(); save(); });
$('#reset').addEventListener('click', () => {
  if (confirm('Reset all settings and presets to defaults?')) {
    resetState(); location.reload();
  }
});

/* Import / Export */
$('#exportBtn')?.addEventListener('click', () => persistence.downloadExport());
$('#shareBtn')?.addEventListener('click', () => persistence.sharePresets());
$('#importBtn')?.addEventListener('click', () => {
  persistence.triggerImport(result => {
    if (result.success) {
      toast(result.message, 'success');
      // Reload UI from state
      Object.assign(S, getState());
      renderEQ(); renderModes(); renderProfiles();
      syncEngineState();
    } else {
      toast(result.message, 'error', 5000);
    }
  });
});

/* Processing status */
function renderProcessingStatus() {
  const badge = $('#procStatus');
  if (!badge) return;
  if (engineReady) {
    badge.textContent = S.processingEnabled ? 'Active' : 'Bypassed';
    badge.style.background = S.processingEnabled ? 'var(--ok)' : 'var(--warn)';
    badge.style.color = '#fff';
  } else {
    badge.textContent = 'Engine not connected';
    badge.style.background = '';
    badge.style.color = '';
  }
}

/* Donation link toggle */
$('#donateToggle')?.addEventListener('change', function() {
  S.donationLinkEnabled = this.checked; save();
  const link = $('#donateLink');
  if (link) link.hidden = !this.checked;
});

/* ────────────────────────────────────────────────
   Home screen: now-playing update
   ──────────────────────────────────────────────── */

function updateNowPlaying() {
  const ps = playerMod.getPlayerState();
  const np = $('#nowPlaying');
  if (!np) return;
  if (ps.track) {
    np.innerHTML = `<div style="display:flex;gap:16px;align-items:center">
      <div style="width:56px;height:56px;border-radius:12px;background:var(--pl);display:grid;place-items:center;color:var(--p)">${ic('music')}</div>
      <div style="flex:1"><div class="sub">Now Playing</div><b>${ps.track.title}</b><div class="sub">${ps.track.artist || 'Unknown artist'}</div></div>
      <button class="ib" id="homePlayPause" aria-label="${ps.isPlaying ? 'Pause' : 'Play'}">${ic(ps.isPlaying ? 'pause' : 'play')}</button>
    </div>`;
    $('#homePlayPause')?.addEventListener('click', async () => {
      await ensureEngine();
      playerMod.togglePlayPause();
    });
  } else {
    np.innerHTML = `<div style="display:flex;gap:16px;align-items:center">
      <div style="width:56px;height:56px;border-radius:12px;background:var(--pl);display:grid;place-items:center;color:var(--p)">${ic('music')}</div>
      <div style="flex:1"><div class="sub">Now Playing</div><b>No track loaded</b><div class="sub">Open the Player tab to add music.</div></div>
    </div>`;
  }
}

playerMod.onPlayerChange(() => updateNowPlaying());

/* ────────────────────────────────────────────────
   Initialisation
   ──────────────────────────────────────────────── */

renderIcons();
playerMod.initPlayer();
initRouter();
renderModes();
renderEQ();
renderF();
renderSrc();
renderProfiles();
renderPlayerScreen();
updateNowPlaying();
vol();
theme();
renderProcessingStatus();

// Start route monitoring for auto profile switching
profiles.startRouteMonitoring((routeId) => {
  renderEQ(); renderModes(); renderProfiles();
  syncEngineState();
});

// Start peak metering
updatePeakMeter();

// Mobile haptic feedback delegation
document.addEventListener('click', e => {
  if (S.hapticFeedback && e.target.closest('button, .tile, .chip, .sw, [role="button"], [role="radio"]')) {
    triggerHaptic('light');
  }
});

// Init engine on first interaction
document.addEventListener('click', () => ensureEngine(), { once: true });
document.addEventListener('touchstart', () => ensureEngine(), { once: true });

console.log('[BassLab 3D] v2.0 initialised — Credits: Arunaksha Das');
