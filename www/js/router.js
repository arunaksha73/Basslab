/**
 * BassLab 3D — Router
 * Screen navigation, history stack, back-button support.
 * Credits: Arunaksha Das
 */

import { $, $$, ic } from './ui.js';

const TABS = [
  ['home',     'Home',      'home'],
  ['player',   'Player',    'music'],
  ['eq',       'Equalizer', 'eq'],
  ['fx',       'Effects',   'fx'],
  ['settings', 'Settings',  'gear']
];

let hist     = ['home'];
let onNav    = null;  // callback when screen changes

export function setNavCallback(fn) { onNav = fn; }

/** Render the bottom navigation bar */
export function renderNav() {
  const nav = $('nav.bar');
  nav.innerHTML = TABS.map(t =>
    `<button data-go="${t[0]}">${ic(t[2])}${t[1]}</button>`
  ).join('');
}

/** Navigate to a screen */
export function go(id, isBack) {
  $$('.scr').forEach(s => s.classList.toggle('on', s.id === id));
  const nav = $('nav.bar');
  nav.querySelectorAll('button').forEach(b => {
    if (b.dataset.go === id) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (!isBack && hist[hist.length - 1] !== id) hist.push(id);
  if (location.hash.replace('#', '') !== id) {
    history.replaceState(null, '', '#' + id);
  }
  $('main').scrollTop = 0;
  if (onNav) onNav(id);
}

/** Go back in history */
export function goBack() {
  hist.pop();
  go(hist[hist.length - 1] || 'home', true);
}

/** Wire up global click/keyboard delegation for navigation */
export function initRouter() {
  renderNav();

  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g) { go(g.dataset.go); return; }
    if (e.target.closest('.back')) { goBack(); }
  });

  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-go][role=button]')) {
      e.preventDefault();
      go(e.target.dataset.go);
    }
  });

  const initHash = location.hash.replace('#', '');
  go(initHash && $(`#${initHash}`) ? initHash : 'home');

  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h && $(`#${h}`) && currentScreen() !== h) go(h);
  });
}

export function currentScreen() {
  return hist[hist.length - 1] || 'home';
}
