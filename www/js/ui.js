/**
 * BassLab 3D — UI Helpers
 * Icons, DOM selectors, toast notifications, component builders.
 * Credits: Arunaksha Das
 */

/* ── Icon SVG paths ── */

export const IC = {
  gear:   '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  back:   '<path d="M15 5l-7 7 7 7"/>',
  home:   '<path d="M4 11l8-7 8 7v9H4z"/>',
  eq:     '<path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="9" r="2" fill="var(--s)"/><circle cx="12" cy="15" r="2" fill="var(--s)"/><circle cx="19" cy="8" r="2" fill="var(--s)"/>',
  fx:     '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
  music:  '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>',
  vol:    '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  info:   '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.1"/>',
  power:  '<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
  src:    '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 12h8"/>',
  movie:  '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 11h18M7 7l-2-3M13 7l-2-3"/>',
  voice:  '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  game:   '<rect x="3" y="8" width="18" height="10" rx="4"/><path d="M8 11v4M6 13h4M16 12v.1M18 14v.1"/>',
  sport:  '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  night:  '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/>',
  bars:   '<path d="M5 20V10M10 20V4M15 20V8M20 20V13"/>',
  wave:   '<path d="M2 12c3-8 5-8 8 0s5 8 8 0 3-4 4 0"/>',
  cube:   '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
  ring:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  mic:    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/>',
  bass:   '<path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4"/>',
  play:   '<polygon points="6,3 20,12 6,21"/>',
  pause:  '<rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/>',
  skip:   '<path d="M6 4l10 8-10 8z"/><line x1="18" y1="4" x2="18" y2="20"/>',
  prev:   '<path d="M18 20L8 12l10-8z"/><line x1="6" y1="4" x2="6" y2="20"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M3 11V9a4 4 0 0 1 4-4h13M7 22l-3-3 3-3"/><path d="M21 13v2a4 4 0 0 1-4 4H4"/>',
  shuffle:'<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  folder: '<path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z"/>',
  timer:  '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  ab:     '<path d="M3 7h4a3 3 0 0 1 0 6H5M5 10h2M3 17V7"/><path d="M14 7h4a3 3 0 0 1 0 4h-4v6h4a3 3 0 0 0 0-6"/>',
  warn:   '<path d="M12 2L2 20h20L12 2z"/><path d="M12 9v5M12 17v.1"/>',
  export: '<path d="M12 3v12M5 12l7 7 7-7"/><path d="M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/>',
  import: '<path d="M12 21V9M5 12l7-7 7 7"/><path d="M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/>',
  share:  '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  sweep:  '<path d="M2 17C5 5 10 5 12 12s5 7 10-5"/>',
  noise:  '<path d="M3 12l2-4 2 7 2-5 2 3 2-6 2 8 2-3 2 5 2-7 2 2"/>',
  lr:     '<path d="M5 4v16M8 12h8M19 8v8"/><circle cx="5" cy="8" r="2" fill="var(--s)"/><circle cx="19" cy="12" r="2" fill="var(--s)"/>',
  heart:  '<path d="M20 7a5.2 5.2 0 0 0-8-4 5.2 5.2 0 0 0-8 4c0 6 8 11 8 11s8-5 8-11z"/>',
  check:  '<path d="M5 12l5 5L20 7"/>',
  x:      '<path d="M18 6L6 18M6 6l12 12"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M3 18a3 3 0 0 0 3 3h1V15H4a1 1 0 0 0-1 1v2zM21 18a3 3 0 0 1-3 3h-1V15h3a1 1 0 0 1 1 1v2z"/>',
  roommic:'<path d="M12 1v4M12 19v4M1 12h4M19 12h4"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="9" stroke-dasharray="4 3"/>'
};

/* ── DOM helpers ── */

export function $(q)  { return document.querySelector(q); }
export function $$(q) { return document.querySelectorAll(q); }

/* ── Haptic feedback ── */

/**
 * Trigger a short haptic vibration on supporting mobile devices.
 * @param {'light'|'medium'|'heavy'|'success'} type
 */
export function triggerHaptic(type = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    const pattern = type === 'success' ? [12, 40, 12] : (type === 'heavy' ? 25 : (type === 'medium' ? 15 : 8));
    navigator.vibrate(pattern);
  } catch (e) { /* ignore */ }
}

/* ── Icon rendering ── */

export function renderIcons(root) {
  (root || document).querySelectorAll('svg[data-ic]').forEach(s => {
    s.setAttribute('class', 'i');
    s.setAttribute('viewBox', '0 0 24 24');
    s.innerHTML = IC[s.dataset.ic] || '';
  });
}

export function ic(name) {
  return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[name] || ''}</svg>`;
}

/* ── Toast notification system ── */

let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Show a brief toast message.
 * @param {string} msg
 * @param {'info'|'success'|'warn'|'error'} type
 * @param {number} ms  Duration in milliseconds
 */
export function toast(msg, type = 'info', ms = 2800) {
  const c = ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/* ── Component builders ── */

export function createTile(iconName, label, opts = {}) {
  const pressed = opts.pressed ? 'true' : 'false';
  const disabled = opts.disabled ? ' disabled' : '';
  const dataAttr = opts.dataAttr || '';
  return `<button class="tile" aria-pressed="${pressed}"${disabled} ${dataAttr}>${ic(iconName)}${label}</button>`;
}

export function createChip(label, pressed = false, dataAttr = '') {
  return `<button class="chip" aria-pressed="${pressed}" ${dataAttr}>${label}</button>`;
}

export function createSwitch(id, checked = false, label = '') {
  return `<label class="sw" aria-label="${label}"><input type="checkbox" id="${id}"${checked ? ' checked' : ''} aria-label="${label}"><i></i></label>`;
}

export function createSliderRow(label, id, min, max, value, unit = '') {
  return `<div class="row"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" value="${value}" aria-label="${label}"><span class="v" id="${id}v">${value}${unit}</span></div>`;
}
