/**
 * BassLab 3D — Local Music Player
 * File picker, playback, queue, repeat, shuffle, sleep timer.
 * All DSP runs on this player's audio via the audio engine.
 * Credits: Arunaksha Das
 */

import engine from './audio-engine.js';
import { getState, saveState } from './state.js';
import { toast } from './ui.js';

/* ── Player state ── */

const player = {
  audio:       null,   // HTMLAudioElement
  queue:       [],     // [{ name, url, file, artist, title, album, duration }]
  currentIdx:  -1,
  isPlaying:   false,
  repeat:      'off',  // 'off' | 'all' | 'one'
  shuffle:     false,
  _shuffleOrder: [],
  _shuffleIdx:   0,
  _connected:  false,  // source connected to engine?
  _sleepTimer: null,
  _sleepFadeInterval: null,
  _listeners:  []
};

/* ── Initialisation ── */

function ensureAudioElement() {
  if (!player.audio) {
    player.audio = new Audio();
    player.audio.crossOrigin = 'anonymous';
    player.audio.preload = 'metadata';

    player.audio.addEventListener('ended', () => {
      onTrackEnded();
    });

    player.audio.addEventListener('error', (e) => {
      console.error('[player] Playback error:', e);
      toast('Playback error: could not play this file', 'error');
      player.isPlaying = false;
      notify();
    });

    player.audio.addEventListener('loadedmetadata', () => {
      // Update queue entry with actual duration
      if (player.currentIdx >= 0 && player.queue[player.currentIdx]) {
        player.queue[player.currentIdx].duration = player.audio.duration;
      }
      notify();
    });

    player.audio.addEventListener('timeupdate', () => {
      notify();
    });
  }
  return player.audio;
}

function connectToEngine() {
  if (player._connected || !player.audio) return;
  try {
    engine.connectMediaElement(player.audio);
    player._connected = true;
  } catch (e) {
    console.warn('[player] Engine connection failed (may work after first play):', e);
  }
}

/* ── File picking ── */

/**
 * Open a file picker to add audio files to the queue.
 * @returns {Promise<number>} Number of files added
 */
export async function pickFiles() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type     = 'file';
    input.accept   = 'audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus';
    input.multiple = true;

    input.addEventListener('change', () => {
      if (!input.files || input.files.length === 0) {
        resolve(0);
        return;
      }

      const startIdx = player.queue.length;
      for (const file of input.files) {
        const url = URL.createObjectURL(file);
        const entry = {
          name:     file.name,
          url:      url,
          file:     file,
          artist:   '',
          title:    file.name.replace(/\.[^.]+$/, ''),
          album:    '',
          duration: 0
        };

        // Try to read metadata from filename
        // Common format: "Artist - Title.ext"
        const match = file.name.replace(/\.[^.]+$/, '').match(/^(.+?)\s*[-–—]\s*(.+)$/);
        if (match) {
          entry.artist = match[1].trim();
          entry.title  = match[2].trim();
        }

        player.queue.push(entry);
      }

      toast(`Added ${input.files.length} track(s)`, 'success');

      // Auto-play first track if nothing is playing
      if (player.currentIdx === -1) {
        playTrack(startIdx);
      }

      notify();
      resolve(input.files.length);
    });

    input.click();
  });
}

/* ── Playback controls ── */

/**
 * Play a specific track by queue index.
 */
export function playTrack(index) {
  if (index < 0 || index >= player.queue.length) return;

  ensureAudioElement();
  connectToEngine();

  player.currentIdx = index;
  player.audio.src  = player.queue[index].url;
  player.audio.load();

  player.audio.play()
    .then(() => {
      player.isPlaying = true;
      notify();
    })
    .catch(e => {
      console.error('[player] Play failed:', e);
      toast('Playback failed. Tap to retry.', 'error');
      player.isPlaying = false;
      notify();
    });
}

export function play() {
  if (!player.audio) return;
  if (player.currentIdx === -1 && player.queue.length > 0) {
    playTrack(0);
    return;
  }
  player.audio.play().then(() => {
    player.isPlaying = true;
    notify();
  }).catch(() => {});
}

export function pause() {
  if (!player.audio) return;
  player.audio.pause();
  player.isPlaying = false;
  notify();
}

export function togglePlayPause() {
  if (player.isPlaying) pause();
  else play();
}

export function seek(time) {
  if (!player.audio) return;
  player.audio.currentTime = Math.max(0, Math.min(time, player.audio.duration || 0));
}

export function seekRelative(delta) {
  if (!player.audio) return;
  seek(player.audio.currentTime + delta);
}

/* ── Skip / Previous ── */

export function next() {
  if (player.queue.length === 0) return;

  if (player.shuffle) {
    const nextIdx = getNextShuffleIndex();
    if (nextIdx !== -1) playTrack(nextIdx);
    else if (player.repeat === 'all') {
      regenerateShuffleOrder();
      playTrack(player._shuffleOrder[0]);
    }
    return;
  }

  if (player.currentIdx < player.queue.length - 1) {
    playTrack(player.currentIdx + 1);
  } else if (player.repeat === 'all') {
    playTrack(0);
  }
}

export function prev() {
  if (!player.audio) return;
  // If more than 3 seconds into the track, restart it
  if (player.audio.currentTime > 3) {
    seek(0);
    return;
  }
  if (player.currentIdx > 0) {
    playTrack(player.currentIdx - 1);
  }
}

function onTrackEnded() {
  if (player.repeat === 'one') {
    seek(0);
    play();
    return;
  }
  next();
}

/* ── Shuffle ── */

export function toggleShuffle() {
  player.shuffle = !player.shuffle;
  const s = getState();
  s.playerShuffle = player.shuffle;
  saveState();
  if (player.shuffle) regenerateShuffleOrder();
  notify();
}

function regenerateShuffleOrder() {
  player._shuffleOrder = [...Array(player.queue.length).keys()];
  // Fisher-Yates shuffle
  for (let i = player._shuffleOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [player._shuffleOrder[i], player._shuffleOrder[j]] = [player._shuffleOrder[j], player._shuffleOrder[i]];
  }
  player._shuffleIdx = 0;
}

function getNextShuffleIndex() {
  if (player._shuffleOrder.length === 0) regenerateShuffleOrder();
  player._shuffleIdx++;
  if (player._shuffleIdx >= player._shuffleOrder.length) return -1;
  return player._shuffleOrder[player._shuffleIdx];
}

/* ── Repeat ── */

export function cycleRepeat() {
  const modes = ['off', 'all', 'one'];
  const idx = modes.indexOf(player.repeat);
  player.repeat = modes[(idx + 1) % 3];
  const s = getState();
  s.playerRepeat = player.repeat;
  saveState();
  notify();
}

/* ── Queue management ── */

export function getQueue() {
  return player.queue;
}

export function removeFromQueue(index) {
  if (index < 0 || index >= player.queue.length) return;
  // Revoke object URL
  URL.revokeObjectURL(player.queue[index].url);
  player.queue.splice(index, 1);
  if (index < player.currentIdx) {
    player.currentIdx--;
  } else if (index === player.currentIdx) {
    pause();
    player.currentIdx = -1;
    if (player.queue.length > 0) {
      playTrack(Math.min(index, player.queue.length - 1));
    }
  }
  notify();
}

export function clearQueue() {
  player.queue.forEach(q => URL.revokeObjectURL(q.url));
  player.queue = [];
  player.currentIdx = -1;
  if (player.audio) {
    player.audio.pause();
    player.audio.src = '';
  }
  player.isPlaying = false;
  notify();
}

export function moveInQueue(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const [item] = player.queue.splice(fromIdx, 1);
  player.queue.splice(toIdx, 0, item);
  // Update currentIdx
  if (player.currentIdx === fromIdx) {
    player.currentIdx = toIdx;
  } else if (fromIdx < player.currentIdx && toIdx >= player.currentIdx) {
    player.currentIdx--;
  } else if (fromIdx > player.currentIdx && toIdx <= player.currentIdx) {
    player.currentIdx++;
  }
  notify();
}

/* ── Sleep timer ── */

/**
 * Start a sleep timer with fade-out.
 * @param {number} minutes  Timer duration in minutes
 */
export function startSleepTimer(minutes) {
  clearSleepTimer();
  if (minutes <= 0) return;

  const fadeStart = Math.max(0, minutes * 60 - 30); // start fading 30s before end
  const endTime   = minutes * 60;

  const startTime = Date.now();

  player._sleepFadeInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed >= endTime) {
      pause();
      clearSleepTimer();
      if (player.audio) player.audio.volume = 1;
      toast('Sleep timer: playback stopped', 'info');
      return;
    }
    if (elapsed >= fadeStart && player.audio) {
      const remaining = endTime - elapsed;
      const fadeRatio  = remaining / 30;
      player.audio.volume = Math.max(0, fadeRatio);
    }
    notify();
  }, 1000);

  player._sleepTimer = { minutes, startedAt: startTime };
  const s = getState();
  s.sleepTimer = minutes;
  saveState();
  toast(`Sleep timer: ${minutes} min`, 'info');
  notify();
}

export function clearSleepTimer() {
  if (player._sleepFadeInterval) {
    clearInterval(player._sleepFadeInterval);
    player._sleepFadeInterval = null;
  }
  player._sleepTimer = null;
  if (player.audio) player.audio.volume = 1;
  const s = getState();
  s.sleepTimer = null;
  saveState();
  notify();
}

export function getSleepTimerRemaining() {
  if (!player._sleepTimer) return null;
  const elapsed = (Date.now() - player._sleepTimer.startedAt) / 1000;
  const remaining = player._sleepTimer.minutes * 60 - elapsed;
  return Math.max(0, remaining);
}

/* ── Per-song EQ ── */

/**
 * Save EQ preset association for the current track.
 */
export function savePerSongEQ(presetName) {
  const track = getCurrentTrack();
  if (!track) return;
  const key = `${track.artist} – ${track.title}`;
  const s = getState();
  s.perSongEQ[key] = presetName;
  saveState();
  toast(`EQ saved for "${track.title}"`, 'success');
}

/**
 * Check if the current track has a saved EQ preset.
 * @returns {string|null} preset name or null
 */
export function getPerSongEQ() {
  const track = getCurrentTrack();
  if (!track) return null;
  const key = `${track.artist} – ${track.title}`;
  const s = getState();
  return s.perSongEQ[key] || null;
}

/* ── State reporting ── */

export function getCurrentTrack() {
  if (player.currentIdx < 0 || player.currentIdx >= player.queue.length) return null;
  return player.queue[player.currentIdx];
}

export function getPlayerState() {
  return {
    isPlaying:   player.isPlaying,
    currentIdx:  player.currentIdx,
    currentTime: player.audio ? player.audio.currentTime : 0,
    duration:    player.audio ? (player.audio.duration || 0) : 0,
    repeat:      player.repeat,
    shuffle:     player.shuffle,
    queueLength: player.queue.length,
    sleepTimer:  getSleepTimerRemaining(),
    track:       getCurrentTrack()
  };
}

/* ── Event system ── */

export function onPlayerChange(fn) {
  player._listeners.push(fn);
  return () => {
    player._listeners = player._listeners.filter(l => l !== fn);
  };
}

function notify() {
  const state = getPlayerState();
  player._listeners.forEach(fn => fn(state));
}

/* ── Format helpers ── */

export function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ── Init from saved state ── */

export function initPlayer() {
  const s = getState();
  player.repeat  = s.playerRepeat  || 'off';
  player.shuffle = s.playerShuffle || false;
  ensureAudioElement();
}
