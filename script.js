/**
 * SnapBooth – Premium Photobooth Application
 * script.js – Complete working implementation
 */

import { loadPhotoLibrary, savePhotoLibrary } from './gallery-store.js';

'use strict';

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════ */
const State = {
  // Camera
  stream: null,
  cameraRequest: null,
  cameraRequestId: 0,
  cameraStopTimer: null,
  facingMode: 'user',
  cameraReady: false,
  cameraPaused: false,
  boothVisible: false,
  filterLoop: null,
  faceLandmarker: null,
  faceLandmarkerPromise: null,
  faceLandmarks: null,
  faceFocusEnabled: false,
  lastFaceDetection: 0,
  lastFocusConstraintTime: 0,
  focusConstraintPending: false,
  cameraFocusRequested: false,

  // Capture
  mode: 'single',       // single | strip2 | strip4 | gif | boomerang
  countdown: 3,
  filter: 'none',
  effects: new Set(),
  frame: 'none',
  theme: 'none',
  bg: 'none',
  stripCaptures: [],
  shotSequenceCount: 0,
  shotSequencePhotos: [],
  sequenceViewerIndex: 0,
  sequenceViewerReturnFocus: null,
  capturing: false,
  captureTimer: null,
  captureResolve: null,
  captureId: 0,
  gifFrames: [],

  // UI
  soundEnabled: true,
  lightMode: false,
  fullscreen: false,

  // Gallery
  gallery: [],
  currentPhoto: null,
  galleryStorage: 'indexeddb',

  // Delete
  modalReturnFocus: null,

  // Onboarding
  obStep: 0,

  // Audio context
  audioCtx: null,
};

/* ═══════════════════════════════════════════════
   DOM REFERENCES
═══════════════════════════════════════ */
const $ = id => document.getElementById(id);
const video        = $('video');
const filterCanvas = $('filter-canvas');
const focusSensorCanvas = $('focus-sensor-canvas');
const captureBtn   = $('capture-btn');
const resultPanel  = $('result-panel');
const resultCanvas = $('result-canvas');
const resultInner = resultPanel.querySelector('.result-inner');
const resultShots = $('result-shots');
const resultShotList = $('result-shot-list');
const resultOutputLabel = $('result-output-label');
const countdown    = $('countdown-display');
const flashEl      = $('flash-overlay');
const cameraLoading= $('camera-loading');
const cameraError  = $('camera-error');
const cameraWrap   = $('camera-wrap');
const stripPreview = $('strip-preview');
const shotSequence = $('shot-sequence');
const shotSequenceCount = $('shot-sequence-count');
const clearShotHistoryButton = $('clear-shot-history');
const sequenceViewer = $('sequence-viewer');
const sequenceViewerImage = $('sequence-viewer-image');
const sequenceViewerCaption = $('sequence-viewer-caption');
const themeOverlay = $('theme-overlay');
const frameOverlay = $('frame-overlay');
const stickerLayer = $('sticker-layer');
const filterCtx    = filterCanvas.getContext('2d', { willReadFrequently: true });

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  buildStickers();
  const library = await loadPhotoLibrary();
  State.gallery = library.photos;
  State.galleryStorage = library.storage;
  loadPreferences();
  bindNavLinks();
  bindActions();
  bindModeButtons();
  bindCountdownButtons();
  bindFilterButtons();
  bindFrameButtons();
  bindPhotoEffects();
  bindBgButtons();
  bindKeyboard();
  // Show onboarding on the first visit where browser storage is available.
  try {
    if (!localStorage.getItem('sb_onboarded')) {
      setTimeout(() => {
        if (!State.boothVisible && document.visibilityState === 'visible') showOnboarding();
      }, 2200);
    }
  } catch (_) {}

  const booth = $('booth');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.target === booth) updateBoothVisibility(entry.isIntersecting);
      });
    }, { threshold: 0.01 });
    observer.observe(booth);
  } else {
    const syncBoothVisibility = () => {
      const bounds = booth.getBoundingClientRect();
      updateBoothVisibility(bounds.top < innerHeight * 0.7 && bounds.bottom > innerHeight * 0.3);
    };
    window.addEventListener('scroll', syncBoothVisibility, { passive: true });
    window.addEventListener('resize', syncBoothVisibility);
    syncBoothVisibility();
  }
});

function updateBoothVisibility(isVisible) {
  State.boothVisible = isVisible;
  if (State.boothVisible) {
    clearTimeout(State.cameraStopTimer);
    State.cameraStopTimer = null;
    if (document.visibilityState === 'visible' && !State.cameraReady && !State.cameraPaused) initCamera();
  } else if (!State.fullscreen) scheduleCameraStop();
}

function scheduleCameraStop(delay = 1200) {
  clearTimeout(State.cameraStopTimer);
  State.cameraStopTimer = setTimeout(() => {
    State.cameraStopTimer = null;
    if (State.boothVisible || State.fullscreen) return;
    if (State.capturing) return scheduleCameraStop(500);
    stopCamera();
  }, delay);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (State.capturing) retake();
    stopCamera();
    const suspended = State.audioCtx?.suspend?.();
    suspended?.catch?.(() => {});
    return;
  }
  if (State.boothVisible && !State.cameraReady && !State.cameraPaused) initCamera();
});

window.addEventListener('pagehide', stopCamera);

/* ═══════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════ */
function buildStickers() {
  const palette = $('sticker-palette');
  if (!palette) return;
  const stickers = ['\u{1F60E}', '\u{1F973}', '\u{1F451}', '\u{1F389}', '\u{1F496}', '\u2728', '\u{1F308}', '\u{1F4AB}', '\u{1F382}', '\u{1F393}', '\u{1F338}', '\u{1F340}', '\u{1F602}', '\u{1F60D}', '\u{1F47B}', '\u{1F98B}', '\u{1F355}', '\u{1F9F8}', '\u{1F48D}', '\u{1F4F8}', '\u{1F388}', '\u{1F490}', '\u{1F929}', '\u2B50'];
  palette.replaceChildren();

  stickers.forEach(emoji => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sticker-opt';
    button.textContent = emoji;
    button.setAttribute('aria-label', `Add ${emoji} sticker`);
    button.addEventListener('click', () => {
      const item = document.createElement('div');
      item.className = 'placed-sticker';
      item.textContent = emoji;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', 'Drag to move; double-click to remove');
      item.style.left = '50%';
      item.style.top = '50%';
      item.style.translate = '-50% -50%';
      item.addEventListener('dblclick', () => item.remove());
      item.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        const bounds = stickerLayer.getBoundingClientRect();
        const box = item.getBoundingClientRect();
        const offsetX = event.clientX - box.left;
        const offsetY = event.clientY - box.top;
        item.style.translate = '0 0';
        item.setPointerCapture(event.pointerId);
        const move = moveEvent => {
          item.style.left = `${Math.max(0, Math.min(bounds.width - box.width, moveEvent.clientX - bounds.left - offsetX))}px`;
          item.style.top = `${Math.max(0, Math.min(bounds.height - box.height, moveEvent.clientY - bounds.top - offsetY))}px`;
        };
        const stop = () => {
          item.removeEventListener('pointermove', move);
          item.removeEventListener('pointerup', stop);
          item.removeEventListener('pointercancel', stop);
        };
        item.addEventListener('pointermove', move);
        item.addEventListener('pointerup', stop);
        item.addEventListener('pointercancel', stop);
      });
      stickerLayer.appendChild(item);
    });
    palette.appendChild(button);
  });
}

async function persistGallery() {
  const result = await savePhotoLibrary(State.gallery, State.galleryStorage);
  State.galleryStorage = result.storage;
  if (!result.ok) showToast('Photo storage is full. Download your photos before saving more.', 'error');
  return result.ok;
}

function showToast(message, type = 'info') {
  const container = $('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showOnboarding() {
  State.modalReturnFocus = document.activeElement;
  $('onboarding-modal').classList.remove('hidden');
  $('ob-next').focus();
}

function closeOnboarding() {
  $('onboarding-modal').classList.add('hidden');
  try { localStorage.setItem('sb_onboarded', '1'); } catch (_) {}
  if (State.modalReturnFocus instanceof HTMLElement && State.modalReturnFocus.isConnected) {
    State.modalReturnFocus.focus();
  }
  State.modalReturnFocus = null;
}

function nextOnboardingStep() {
  const steps = [...document.querySelectorAll('.ob-step')];
  const dots = [...document.querySelectorAll('.ob-dot')];
  if (!steps.length || State.obStep >= steps.length - 1) return closeOnboarding();
  State.obStep = Math.min(State.obStep + 1, steps.length - 1);
  steps.forEach((step, index) => step.classList.toggle('active', index === State.obStep));
  dots.forEach((dot, index) => dot.classList.toggle('active', index === State.obStep));
  if (State.obStep === steps.length - 1) $('ob-next').textContent = 'Finish';
}

function startCapture() {
  if (!State.cameraReady || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    showToast('Camera is not ready yet. Allow camera access and try again.');
    return;
  }
  if (State.capturing) return;
  if (State.soundEnabled) prepareShutterAudio();
  State.capturing = true;
  const captureId = ++State.captureId;
  captureBtn.disabled = true;
  State.stripCaptures = [];

  (async () => {
    try {
      if (State.mode === 'gif' || State.mode === 'boomerang') {
        await captureAnimatedSequence(captureId);
        return;
      }
      const count = State.mode === 'strip2' ? 2 : State.mode === 'strip4' ? 4 : 1;
      for (let index = 0; index < count; index++) {
        await runCaptureCountdown();
        if (!State.capturing || captureId !== State.captureId) return;
        const shot = createPhotoCanvas();
        State.stripCaptures.push(shot);
        addStripThumbnail(shot);
        if (index < count - 1) {
          showToast(`Photo ${index + 1} of ${count} captured. Get ready for the next one.`);
          await wait(700);
          if (!State.capturing || captureId !== State.captureId) return;
        }
      }
      const output = count === 1 ? State.stripCaptures[0] : createPhotoStrip(State.stripCaptures);
      resultCanvas.width = output.width;
      resultCanvas.height = output.height;
      resultCanvas.getContext('2d').drawImage(output, 0, 0);
      State.currentPhoto = resultCanvas.toDataURL('image/png');
      renderResultShots(State.stripCaptures);
      $('result-gif-preview').classList.add('hidden');
      $('result-gif-preview').removeAttribute('src');
      resultCanvas.classList.remove('hidden');
      $('download-gif-btn').classList.add('hidden');
      document.querySelectorAll('.result-actions [data-action="download-photo"]').forEach(button => {
        if (button.id !== 'download-gif-btn') button.classList.remove('hidden');
      });
      $('result-title').textContent = count === 1 ? 'Looking great!' : `${count} moments, one keepsake.`;
      showResultPanel();
    } catch (err) {
      if (captureId === State.captureId) {
        console.error('Photo capture failed:', err);
        showToast('Could not capture this photo. Please try again.', 'error');
      }
    } finally {
      if (captureId === State.captureId) {
        countdown.classList.remove('visible');
        State.capturing = false;
        captureBtn.disabled = false;
        State.captureTimer = null;
      }
    }
  })();
}

async function captureAnimatedSequence(captureId) {
  await runCaptureCountdown();
  if (!State.capturing || captureId !== State.captureId) return;
  triggerCaptureFlash();
  State.gifFrames = [];
  const frameCount = 8;
  for (let index = 0; index < frameCount; index++) {
    if (!State.capturing || captureId !== State.captureId) return;
    const shot = createPhotoCanvas(false);
    const width = Math.min(360, shot.width);
    const height = Math.max(1, Math.round(shot.height * width / shot.width));
    const frame = document.createElement('canvas');
    frame.width = width;
    frame.height = height;
    frame.getContext('2d').drawImage(shot, 0, 0, width, height);
    State.gifFrames.push(frame);
    await wait(120);
    if (!State.capturing || captureId !== State.captureId) return;
  }
  if (!State.capturing || captureId !== State.captureId) return;

  let sequence = State.gifFrames;
  if (State.mode === 'boomerang') {
    sequence = [...State.gifFrames, ...State.gifFrames.slice(1, -1).reverse()];
  }
  const gifData = encodeGifDataUrl(sequence, 12);
  resultCanvas.width = State.gifFrames[0].width;
  resultCanvas.height = State.gifFrames[0].height;
  resultCanvas.getContext('2d').drawImage(State.gifFrames[0], 0, 0);
  resultCanvas.classList.add('hidden');
  $('result-gif-preview').src = gifData;
  $('result-gif-preview').classList.remove('hidden');
  document.querySelectorAll('.result-actions [data-action="download-photo"]').forEach(button => button.classList.add('hidden'));
  $('download-gif-btn').classList.remove('hidden');
  State.currentPhoto = gifData;
  $('result-title').textContent = State.mode === 'boomerang' ? 'A moment that comes back around.' : 'Your little moment, in motion.';
  renderResultShots([]);
  addStripThumbnail(State.gifFrames[0]);
  showResultPanel();
}

function showResultPanel() {
  State.modalReturnFocus = captureBtn;
  resultPanel.classList.remove('hidden');
  const cameraRect = cameraWrap.getBoundingClientRect();
  const resultRect = resultInner.getBoundingClientRect();
  const cameraCenterX = cameraRect.left + cameraRect.width / 2;
  const cameraCenterY = cameraRect.top + cameraRect.height / 2;
  const resultCenterX = resultRect.left + resultRect.width / 2;
  const resultCenterY = resultRect.top + resultRect.height / 2;
  resultInner.style.setProperty('--print-origin-x', `${cameraCenterX - resultCenterX}px`);
  resultInner.style.setProperty('--print-origin-y', `${cameraCenterY - resultCenterY}px`);
  resultInner.classList.remove('photo-printing');
  void resultInner.offsetWidth;
  resultInner.classList.add('photo-printing');
  $('result-title').focus({ preventScroll: true });
}

function closeResultPanel() {
  resultPanel.classList.add('hidden');
  const returnFocus = State.modalReturnFocus || captureBtn;
  State.modalReturnFocus = null;
  if (document.visibilityState === 'visible') returnFocus.focus({ preventScroll: true });
}

function renderResultShots(photos) {
  const multiplePhotos = photos.length > 1;
  resultShots.classList.toggle('hidden', !multiplePhotos);
  resultOutputLabel.classList.toggle('hidden', !multiplePhotos);
  resultInner.classList.toggle('has-multiple-shots', multiplePhotos);
  resultShotList.replaceChildren();
  if (!multiplePhotos) return;

  photos.forEach((photo, index) => {
    const card = document.createElement('figure');
    card.className = 'result-shot-card';
    card.setAttribute('role', 'listitem');
    const image = document.createElement('img');
    image.src = createPreviewDataUrl(photo, 420);
    image.alt = `Photo ${index + 1}`;
    const caption = document.createElement('figcaption');
    caption.textContent = `Photo ${index + 1}`;
    card.append(image, caption);
    resultShotList.appendChild(card);
  });
}

function encodeGifDataUrl(frames, delay) {
  const first = frames[0];
  const width = first.width;
  const height = first.height;
  const bytes = [];
  const ascii = value => { for (const char of value) bytes.push(char.charCodeAt(0)); };
  const u16 = value => { bytes.push(value & 255, (value >> 8) & 255); };
  ascii('GIF89a');
  u16(width); u16(height);
  bytes.push(0xF7, 0, 0);
  for (let index = 0; index < 256; index++) {
    bytes.push(Math.round(((index >> 5) & 7) * 255 / 7));
    bytes.push(Math.round(((index >> 2) & 7) * 255 / 7));
    bytes.push((index & 3) * 85);
  }
  bytes.push(0x21, 0xFF, 0x0B); ascii('NETSCAPE2.0');
  bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);

  frames.forEach(frame => {
    const pixels = frame.getContext('2d').getImageData(0, 0, width, height).data;
    const indices = new Uint8Array(width * height);
    for (let source = 0, target = 0; source < pixels.length; source += 4, target++) {
      indices[target] = (pixels[source] & 0xE0) | ((pixels[source + 1] & 0xE0) >> 3) | (pixels[source + 2] >> 6);
    }
    const compressed = encodeGifLzw(indices);
    bytes.push(0x21, 0xF9, 0x04, 0x04);
    u16(delay); bytes.push(0, 0);
    bytes.push(0x2C); u16(0); u16(0); u16(width); u16(height); bytes.push(0);
    bytes.push(8);
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const size = Math.min(255, compressed.length - offset);
      bytes.push(size, ...compressed.subarray(offset, offset + size));
    }
    bytes.push(0);
  });
  bytes.push(0x3B);

  let binary = '';
  const block = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += block) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + block));
  }
  return `data:image/gif;base64,${btoa(binary)}`;
}

function encodeGifLzw(indices) {
  const output = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = 9;
  const clearCode = 256;
  const endCode = 257;
  let nextCode = 258;
  let dictionary = new Map();
  const emit = code => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuffer & 255);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  emit(clearCode);
  if (!indices.length) { emit(endCode); return Uint8Array.from(output); }
  let prefix = indices[0];
  for (let index = 1; index < indices.length; index++) {
    const value = indices[index];
    const key = prefix * 256 + value;
    if (dictionary.has(key)) {
      prefix = dictionary.get(key);
      continue;
    }
    emit(prefix);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode++);
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clearCode);
      dictionary = new Map();
      nextCode = 258;
      codeSize = 9;
    }
    prefix = value;
  }
  emit(prefix);
  emit(endCode);
  if (bitCount > 0) output.push(bitBuffer & 255);
  return Uint8Array.from(output);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runCaptureCountdown() {
  return new Promise(resolve => {
    let remaining = State.countdown;
    if (remaining <= 0) { resolve(); return; }
    const finish = () => {
      clearInterval(State.captureTimer);
      State.captureTimer = null;
      State.captureResolve = null;
      countdown.classList.remove('visible');
      resolve();
    };
    State.captureResolve = finish;
    countdown.classList.add('visible');
    countdown.textContent = String(remaining);
    State.captureTimer = setInterval(() => {
      remaining -= 1;
      if (!State.capturing || remaining <= 0) {
        finish();
        return;
      }
      countdown.textContent = String(remaining);
    }, 1000);
  });
}

function createPhotoCanvas(playShutter = true) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error('Camera frame is not ready.');
  const photo = document.createElement('canvas');
  photo.width = width;
  photo.height = height;
  const ctx = photo.getContext('2d');
  applyFilterToCanvas(ctx, video, width, height, State.filter);
  drawBackgroundTint(ctx, width, height);
  drawPhotoOverlays(ctx, width, height);
  if (playShutter) triggerCaptureFlash();
  return addPhotoFrame(photo);
}

function drawBackgroundTint(ctx, width, height) {
  const tints = {
    galaxy: 'rgba(30,30,105,0.2)',
    beach: 'rgba(210,170,95,0.14)',
    city: 'rgba(60,65,130,0.16)',
    forest: 'rgba(0,95,38,0.15)',
    studio: 'rgba(170,125,245,0.15)',
  };
  if (!tints[State.bg]) return;
  ctx.fillStyle = tints[State.bg];
  ctx.fillRect(0, 0, width, height);
}

function triggerCaptureFlash() {
  if (flashEl.animate) {
    flashEl.animate([{ opacity: 0 }, { opacity: 0.82, offset: 0.25 }, { opacity: 0 }], { duration: 300, easing: 'ease-out' });
  }
  if (!State.soundEnabled) return;
  try {
    if (!prepareShutterAudio()) return;
    const oscillator = State.audioCtx.createOscillator();
    const gain = State.audioCtx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1500, State.audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(520, State.audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.045, State.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, State.audioCtx.currentTime + 0.09);
    oscillator.connect(gain);
    gain.connect(State.audioCtx.destination);
    oscillator.start();
    oscillator.stop(State.audioCtx.currentTime + 0.1);
  } catch (_) {}
}

function prepareShutterAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  State.audioCtx ||= new AudioContextClass();
  if (State.audioCtx.state === 'suspended') State.audioCtx.resume().catch(() => {});
  return true;
}

function drawPhotoOverlays(ctx, width, height) {
  const cameraRect = cameraWrap.getBoundingClientRect();
  const scaleX = width / cameraRect.width;
  const scaleY = height / cameraRect.height;
  stickerLayer.querySelectorAll('.placed-sticker').forEach(sticker => {
    const rect = sticker.getBoundingClientRect();
    const fontSize = Math.max(18, rect.height * scaleY);
    ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sticker.textContent, (rect.left - cameraRect.left + rect.width / 2) * scaleX, (rect.top - cameraRect.top + rect.height / 2) * scaleY);
  });

  if (State.theme !== 'none') {
    const labels = { wedding: 'Wedding', birthday: 'Happy Birthday!', graduation: 'Congratulations!', corporate: 'Celebrating together' };
    const bandHeight = Math.round(height * 0.14);
    const gradient = ctx.createLinearGradient(0, height - bandHeight, 0, height);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, height - bandHeight, width, bandHeight);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.max(20, Math.round(height * 0.045))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(labels[State.theme] || '', width / 2, height - Math.round(height * 0.035));
  }

  const watermark = $('watermark-text').value.trim();
  const timestamp = $('timestamp-toggle').checked ? new Date().toLocaleString() : '';
  const caption = [watermark, timestamp].filter(Boolean).join('  ·  ');
  if (caption) {
    const fontSize = Math.max(16, Math.round(height * 0.027));
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const padding = Math.round(width * 0.025);
    const textWidth = ctx.measureText(caption).width;
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.fillRect(width - textWidth - padding * 1.5, height - fontSize - padding, textWidth + padding, fontSize + padding * 0.45);
    ctx.fillStyle = '#fff';
    ctx.fillText(caption, width - padding, height - padding * 0.6);
  }
}

function getFaceFocusTarget(landmarks) {
  if (!landmarks || landmarks.length < 292) return null;
  const xs = landmarks.map(point => point.x);
  const ys = landmarks.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = (maxX - minX) * 0.12;
  const padY = (maxY - minY) * 0.12;
  return {
    left: Math.max(0, minX - padX),
    top: Math.max(0, minY - padY),
    right: Math.min(1, maxX + padX),
    bottom: Math.min(1, maxY + padY),
    point: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

function drawFocusSensor(ctx, landmarks, width, height) {
  const target = getFaceFocusTarget(landmarks);
  if (!target) return null;
  const left = target.left * width;
  const right = target.right * width;
  const top = target.top * height;
  const bottom = target.bottom * height;
  const corner = Math.min((right - left) * 0.2, (bottom - top) * 0.2);

  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = '#fff4a3';
  ctx.lineWidth = Math.max(2, width * 0.004);
  ctx.lineCap = 'round';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(left, top + corner); ctx.lineTo(left, top); ctx.lineTo(left + corner, top);
  ctx.moveTo(right - corner, top); ctx.lineTo(right, top); ctx.lineTo(right, top + corner);
  ctx.moveTo(right, bottom - corner); ctx.lineTo(right, bottom); ctx.lineTo(right - corner, bottom);
  ctx.moveTo(left + corner, bottom); ctx.lineTo(left, bottom); ctx.lineTo(left, bottom - corner);
  ctx.stroke();
  ctx.restore();
  return target;
}
async function loadFaceLandmarker() {
  if (State.faceLandmarker) return State.faceLandmarker;
  if (!State.faceLandmarkerPromise) {
    State.faceLandmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32');
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm');
      State.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
      return State.faceLandmarker;
    })().catch(error => {
      State.faceLandmarkerPromise = null;
      throw error;
    });
  }
  return State.faceLandmarkerPromise;
}

function setFaceFocusStatus(message, forceShow = false) {
  const status = $('face-focus-status');
  if (!status) return;
  if (status.textContent !== message) status.textContent = message;
  status.classList.toggle('hidden', !State.faceFocusEnabled && !forceShow);
}

function clearFocusSensor() {
  if (!focusSensorCanvas) return;
  focusSensorCanvas.getContext('2d').clearRect(0, 0, focusSensorCanvas.width, focusSensorCanvas.height);
}

async function requestCameraFocus(point) {
  const track = State.stream?.getVideoTracks().find(item => item.readyState === 'live');
  if (!track?.applyConstraints || State.focusConstraintPending) return;
  let capabilities = {};
  let supported = {};
  try { capabilities = track.getCapabilities?.() || {}; } catch (_) {}
  try { supported = navigator.mediaDevices.getSupportedConstraints?.() || {}; } catch (_) {}
  const focusModes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];
  const canSetContinuousFocus = focusModes.includes('continuous');
  const canSetFocusPoint = supported.pointsOfInterest === true || Boolean(capabilities.pointsOfInterest);
  const requested = {};
  if (canSetContinuousFocus) requested.focusMode = 'continuous';
  if (canSetFocusPoint) requested.pointsOfInterest = [point];
  if (!Object.keys(requested).length) return;

  State.focusConstraintPending = true;
  const currentConstraints = track.getConstraints?.() || {};
  try {
    await track.applyConstraints({ ...currentConstraints, ...requested });
    State.cameraFocusRequested = canSetFocusPoint;
  } catch (_) {
    State.cameraFocusRequested = false;
    if (canSetFocusPoint && canSetContinuousFocus) {
      try {
        await track.applyConstraints({ ...currentConstraints, focusMode: 'continuous' });
      } catch (_) {}
    }
  } finally {
    State.focusConstraintPending = false;
  }
  if (State.faceFocusEnabled) {
    setFaceFocusStatus(State.cameraFocusRequested
      ? 'Face found. Camera focus is following it.'
      : 'Face found. Your camera is using its available autofocus.');
  }
}

async function toggleFaceFocus() {
  const button = $('face-focus-toggle');
  State.faceFocusEnabled = !State.faceFocusEnabled;
  button.classList.toggle('is-active', State.faceFocusEnabled);
  button.setAttribute('aria-pressed', String(State.faceFocusEnabled));
  const label = State.faceFocusEnabled ? 'Turn face focus off' : 'Turn face focus on';
  button.setAttribute('aria-label', label);
  button.title = label;

  if (!State.faceFocusEnabled) {
    State.faceLandmarks = null;
    State.cameraFocusRequested = false;
    clearFocusSensor();
    setFaceFocusStatus('');
    return;
  }

  setFaceFocusStatus('Loading face focus…');
  try {
    await loadFaceLandmarker();
    if (!State.faceFocusEnabled) return;
    setFaceFocusStatus(State.cameraReady ? 'Looking for a face to focus on…' : 'Turn on the camera to find your subject.');
    showToast('Face focus is on. Aim the camera at your subject.', 'success');
  } catch (error) {
    if (!State.faceFocusEnabled) return;
    console.warn('Could not load face focus:', error);
    State.faceFocusEnabled = false;
    button.classList.remove('is-active');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Turn face focus on');
    button.title = 'Turn face focus on';
    setFaceFocusStatus('Face focus could not load. Check your internet and try again.', true);
    showToast('Face focus could not load. Check your internet and try again.', 'error');
  }
}
function addPhotoFrame(photo) {
  const { width, height } = photo;
  const ctx = photo.getContext('2d');
  const colors = { hearts: '#f472b6', stars: '#fbbf24', floral: '#86efac', gold: '#d4af37' };
  if (State.frame === 'polaroid') {
    const pad = Math.round(width * 0.035);
    const bottom = Math.round(height * 0.16);
    const framed = document.createElement('canvas');
    framed.width = width + pad * 2;
    framed.height = height + pad + bottom;
    const frameCtx = framed.getContext('2d');
    frameCtx.fillStyle = '#fff';
    frameCtx.fillRect(0, 0, framed.width, framed.height);
    frameCtx.drawImage(photo, pad, pad);
    return framed;
  }
  if (State.frame === 'film') {
    const band = Math.max(18, Math.round(height * 0.055));
    ctx.fillStyle = 'rgba(20, 18, 22, 0.94)';
    ctx.fillRect(0, 0, width, band);
    ctx.fillRect(0, height - band, width, band);
    const holeWidth = Math.max(12, Math.round(width * 0.025));
    const holeHeight = Math.max(8, Math.round(band * 0.42));
    const spacing = Math.max(holeWidth * 2.1, Math.round(width * 0.07));
    ctx.fillStyle = '#f8e7b0';
    for (let x = Math.round(spacing / 2); x < width - holeWidth; x += spacing) {
      ctx.fillRect(x, Math.round((band - holeHeight) / 2), holeWidth, holeHeight);
      ctx.fillRect(x, height - band + Math.round((band - holeHeight) / 2), holeWidth, holeHeight);
    }
    return photo;
  }
  if (State.frame === 'rainbow') {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    ['#ff4d6d', '#ff9f1c', '#ffe66d', '#54d68c', '#38bdf8', '#8b5cf6'].forEach((color, index, list) => {
      gradient.addColorStop(index / (list.length - 1), color);
    });
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(12, Math.round(width * 0.022));
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
    return photo;
  }
  if (State.frame === 'confetti') {
    const palette = ['#ff4d6d', '#ffb703', '#38bdf8', '#a78bfa', '#4ade80'];
    const size = Math.max(8, Math.round(width * 0.012));
    const positions = [
      [0.08,0.07],[0.2,0.04],[0.34,0.08],[0.52,0.045],[0.7,0.075],[0.86,0.04],[0.94,0.11],
      [0.06,0.3],[0.94,0.35],[0.04,0.58],[0.96,0.63],[0.1,0.9],[0.24,0.95],[0.42,0.91],
      [0.6,0.96],[0.78,0.91],[0.9,0.96],[0.97,0.83]
    ];
    positions.forEach(([x, y], index) => {
      ctx.save();
      ctx.translate(width * x, height * y);
      ctx.rotate((index % 2 ? 1 : -1) * 0.45);
      ctx.fillStyle = palette[index % palette.length];
      ctx.fillRect(-size / 2, -size / 2, size * (index % 3 === 0 ? 1.4 : 0.8), size * 0.8);
      ctx.restore();
    });
    return photo;
  }
  if (colors[State.frame]) {
    ctx.strokeStyle = colors[State.frame];
    ctx.lineWidth = Math.max(8, Math.round(width * 0.012));
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
    ctx.font = `${Math.round(height * 0.055)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const symbol = State.frame === 'hearts' ? '\u2764\ufe0f' : State.frame === 'stars' ? '\u2b50' : State.frame === 'gold' ? '\u2728' : '\u{1F338}';
    [[0.07,0.08],[0.93,0.08],[0.07,0.92],[0.93,0.92]].forEach(([x,y]) => ctx.fillText(symbol, width*x, height*y));
  }
  return photo;
}

function addStripThumbnail(canvas) {
  State.shotSequenceCount += 1;
  const photo = { src: createPreviewDataUrl(canvas, 1280), number: State.shotSequenceCount };
  State.shotSequencePhotos.push(photo);
  if (State.shotSequencePhotos.length > 24) State.shotSequencePhotos.shift();

  const item = document.createElement('div');
  item.className = 'shot-sequence-item';
  item.setAttribute('role', 'listitem');
  item.setAttribute('aria-label', `Photo ${State.shotSequenceCount} in sequence`);
  const openButton = document.createElement('button');
  openButton.className = 'shot-sequence-open';
  openButton.type = 'button';
  openButton.setAttribute('aria-label', `View photo ${State.shotSequenceCount}`);
  const thumb = document.createElement('img');
  thumb.className = 'strip-thumb';
  thumb.src = photo.src;
  thumb.alt = `Photo ${State.shotSequenceCount}`;
  openButton.appendChild(thumb);
  openButton.addEventListener('click', () => {
    openSequenceViewer([...stripPreview.children].indexOf(item), openButton);
  });
  const number = document.createElement('span');
  number.className = 'shot-sequence-number';
  number.setAttribute('aria-hidden', 'true');
  number.textContent = String(State.shotSequenceCount).padStart(2, '0');
  item.append(openButton, number);
  stripPreview.appendChild(item);
  while (stripPreview.children.length > 24) stripPreview.firstElementChild.remove();
  updateShotSequence();
  stripPreview.scrollLeft = stripPreview.scrollWidth;
}

function createPreviewDataUrl(canvas, maxWidth) {
  const preview = document.createElement('canvas');
  preview.width = Math.min(maxWidth, canvas.width);
  preview.height = Math.max(1, Math.round(canvas.height * preview.width / canvas.width));
  preview.getContext('2d').drawImage(canvas, 0, 0, preview.width, preview.height);
  return preview.toDataURL('image/jpeg', 0.78);
}

function updateShotSequence() {
  const hasPhotos = State.shotSequenceCount > 0;
  shotSequence.classList.toggle('has-photos', hasPhotos);
  clearShotHistoryButton.disabled = !hasPhotos;
  shotSequenceCount.textContent = State.shotSequenceCount > 24
    ? `Showing latest 24 of ${State.shotSequenceCount} photos`
    : `${State.shotSequenceCount} photo${State.shotSequenceCount === 1 ? '' : 's'}`;
}

function clearShotHistory() {
  State.shotSequenceCount = 0;
  State.shotSequencePhotos = [];
  stripPreview.replaceChildren();
  updateShotSequence();
}

function openSequenceViewer(index, returnFocus) {
  if (index < 0 || index >= State.shotSequencePhotos.length) return;
  State.sequenceViewerIndex = index;
  State.sequenceViewerReturnFocus = returnFocus;
  renderSequenceViewer();
  sequenceViewer.classList.remove('hidden');
  sequenceViewer.querySelector('.sequence-viewer-close').focus({ preventScroll: true });
}

function renderSequenceViewer() {
  const photo = State.shotSequencePhotos[State.sequenceViewerIndex];
  if (!photo) return;
  sequenceViewerImage.src = photo.src;
  sequenceViewerImage.alt = `Photo ${photo.number}`;
  sequenceViewerCaption.textContent = `Photo ${photo.number} of ${State.shotSequenceCount}`;
  sequenceViewer.querySelectorAll('.sequence-viewer-nav').forEach(button => {
    button.disabled = State.shotSequencePhotos.length < 2;
  });
}

function navigateSequenceViewer(direction) {
  const count = State.shotSequencePhotos.length;
  if (count < 2) return;
  State.sequenceViewerIndex = (State.sequenceViewerIndex + direction + count) % count;
  renderSequenceViewer();
}

function closeSequenceViewer() {
  sequenceViewer.classList.add('hidden');
  const returnFocus = State.sequenceViewerReturnFocus;
  State.sequenceViewerReturnFocus = null;
  if (returnFocus?.isConnected && document.visibilityState === 'visible') returnFocus.focus({ preventScroll: true });
}

function createPhotoStrip(photos) {
  const width = Math.max(...photos.map(photo => photo.width));
  const gap = Math.round(width * 0.025);
  const margin = Math.round(width * 0.035);
  const height = photos.reduce((sum, photo) => sum + photo.height, 0) + gap * (photos.length - 1) + margin * 2;
  const strip = document.createElement('canvas');
  strip.width = width + margin * 2;
  strip.height = height;
  const ctx = strip.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, strip.width, strip.height);
  let y = margin;
  photos.forEach(photo => {
    ctx.drawImage(photo, margin, y, width, photo.height);
    y += photo.height + gap;
  });
  return strip;
}

function retake() {
  State.captureId += 1;
  if (State.captureResolve) State.captureResolve();
  else if (State.captureTimer) clearInterval(State.captureTimer);
  State.captureTimer = null;
  State.captureResolve = null;
  countdown.classList.remove('visible');
  resultPanel.classList.add('hidden');
  $('result-gif-preview').classList.add('hidden');
  $('result-gif-preview').removeAttribute('src');
  $('download-gif-btn').classList.add('hidden');
  resultCanvas.classList.remove('hidden');
  State.currentPhoto = null;
  State.stripCaptures = [];
  State.capturing = false;
  captureBtn.disabled = false;
  State.modalReturnFocus = null;
  if (State.boothVisible && document.visibilityState === 'visible') captureBtn.focus({ preventScroll: true });
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if ($('booth').requestFullscreen) {
      await $('booth').requestFullscreen();
    } else {
      showToast('Fullscreen is not supported by this browser.', 'error');
    }
  } catch (_) {
    showToast('Could not enter fullscreen. Check your browser permissions.', 'error');
  }
}

document.addEventListener('fullscreenchange', () => {
  State.fullscreen = document.fullscreenElement === $('booth');
  $('booth').classList.toggle('booth-fullscreen', State.fullscreen);
});

function downloadPhoto(format) {
  if (!State.currentPhoto) return;
  const link = document.createElement('a');
  const isGif = State.currentPhoto.startsWith('data:image/gif');
  const actualFormat = isGif ? 'gif' : format;
  link.href = actualFormat === 'jpg' ? resultCanvas.toDataURL('image/jpeg', 0.92) : State.currentPhoto;
  link.download = `snapbooth-${Date.now()}.${actualFormat}`;
  link.click();
}

async function saveToGallery() {
  if (!State.currentPhoto) return;
  const id = window.crypto?.randomUUID?.() || `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const savedData = State.currentPhoto.startsWith('data:image/gif') ? State.currentPhoto : resultCanvas.toDataURL('image/jpeg', 0.82);
  const titles = { single: 'Photo', strip2: '2-photo strip', strip4: '4-photo strip', gif: 'Animated photo', boomerang: 'Boomerang' };
  State.gallery.unshift({
    id,
    data: savedData,
    name: `SnapBooth photo ${new Date().toLocaleString()}`,
    title: titles[State.mode] || 'SnapBooth moment',
    createdAt: Date.now(),
    favorite: false,
  });
  if (!await persistGallery()) { State.gallery.shift(); return; }
  showToast('Saved. Open Gallery to view your photo.');
}

async function sharePhoto() {
  if (!State.currentPhoto) return;
  try {
    const blob = await (await fetch(State.currentPhoto)).blob();
    const extension = blob.type === 'image/gif' ? 'gif' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
    const file = new File([blob], `snapbooth.${extension}`, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My SnapBooth photo' });
    else downloadPhoto('png');
  } catch (_) { downloadPhoto('png'); }
}

function bindNavLinks() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function () {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      this.classList.add('active');
    });
  });
  // Scroll spy
  const sections = document.querySelectorAll('.section');
  const navLinks = document.querySelectorAll('.nav-link');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navLinks.forEach(link => link.classList.toggle('active', link.dataset.section === entry.target.id));
      });
    }, { threshold: 0.4 });
    sections.forEach(section => io.observe(section));
  }
}

function bindActions() {
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest('[data-action]');
    if (control) {
      const action = control.dataset.action;
      if (action === 'open-booth') {
        if (control instanceof HTMLAnchorElement) event.preventDefault();
        openBooth();
      } else if (action === 'retry-camera') initCamera();
      else if (action === 'toggle-camera') toggleCamera();
      else if (action === 'toggle-face-focus') toggleFaceFocus();
      else if (action === 'flip-camera') flipCamera();
      else if (action === 'fullscreen') toggleFullscreen();
      else if (action === 'capture') startCapture();
      else if (action === 'retake') retake();
      else if (action === 'close-result') closeResultPanel();
      else if (action === 'close-sequence-viewer') closeSequenceViewer();
      else if (action === 'previous-sequence-photo') navigateSequenceViewer(-1);
      else if (action === 'next-sequence-photo') navigateSequenceViewer(1);
      else if (action === 'clear-shot-history') clearShotHistory();
      else if (action === 'download-photo') downloadPhoto(control.dataset.format);
      else if (action === 'save-photo') saveToGallery();
      else if (action === 'share-photo') sharePhoto();
      else if (action === 'close-onboarding') closeOnboarding();
      else if (action === 'next-onboarding') nextOnboardingStep();
    }

  });

  $('theme-toggle').addEventListener('click', () => {
    State.lightMode = !State.lightMode;
    document.body.classList.toggle('light-mode', State.lightMode);
    $('theme-toggle').textContent = State.lightMode ? '☀️' : '🌙';
    savePreferences();
  });

  $('sound-toggle').addEventListener('click', () => {
    State.soundEnabled = !State.soundEnabled;
    $('sound-toggle').textContent = State.soundEnabled ? '🔊' : '🔇';
    showToast(State.soundEnabled ? 'Sound on 🔊' : 'Sound off 🔇', 'info');
    savePreferences();
  });

  $('theme-select').addEventListener('change', event => applyTheme(event.target.value));
}

function openBooth() {
  document.querySelector('#booth').scrollIntoView({ behavior: 'smooth' });
  State.boothVisible = true;
  if (!State.cameraReady && !State.cameraPaused) initCamera();
}

function savePreferences() {
  try {
    localStorage.setItem('sb_prefs', JSON.stringify({ sound: State.soundEnabled, light: State.lightMode }));
  } catch (error) {
    console.warn('Could not save preferences:', error);
  }
}

function loadPreferences() {
  try {
    const p = JSON.parse(localStorage.getItem('sb_prefs') || '{}');
    if (p.light) { State.lightMode = true; document.body.classList.add('light-mode'); $('theme-toggle').textContent = '☀️'; }
    if (p.sound === false) { State.soundEnabled = false; $('sound-toggle').textContent = '🔇'; }
  } catch (_) {}
}

/* ═══════════════════════════════════════════════
   CAMERA
═══════════════════════════════════════ */
async function initCamera() {
  if (State.cameraPaused) return;
  if (State.cameraRequest) return State.cameraRequest;
  if (State.cameraReady && State.stream && State.stream.getVideoTracks().some(track => track.readyState === 'live')) return;

  cameraError.classList.add('hidden');
  cameraLoading.classList.remove('camera-is-off');
  $('camera-loading-message').textContent = 'Starting camera…';
  cameraLoading.style.display = 'flex';
  State.cameraReady = false;
  syncCameraToggle();
  if (State.stream) State.stream.getTracks().forEach(track => track.stop());
  State.stream = null;
  const requestId = ++State.cameraRequestId;

  const constraints = {
    video: {
      facingMode: { ideal: State.facingMode },
      width: { ideal: 1280 },
      height: { ideal: 960 }
    },
    audio: false
  };

  const request = (async () => {
    let stream = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException('Camera access requires HTTPS or localhost.', 'NotSupportedError');
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        if (error.name !== 'OverconstrainedError') throw error;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (requestId !== State.cameraRequestId || document.visibilityState === 'hidden') {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      State.stream = stream;
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (State.stream !== stream) return;
        State.cameraReady = false;
        stopCamera();
        cameraLoading.style.display = 'none';
        $('camera-error-msg').textContent = 'The camera was disconnected. Reconnect it and try again.';
        cameraError.classList.remove('hidden');
      }, { once: true }));
      const metadataReady = video.readyState >= HTMLMediaElement.HAVE_METADATA
        ? Promise.resolve()
        : new Promise((resolve, reject) => {
            video.addEventListener('loadedmetadata', resolve, { once: true });
            video.addEventListener('error', () => reject(video.error || new Error('Could not load camera preview.')), { once: true });
          });
      video.srcObject = stream;
      await metadataReady;
      await video.play();
      if (requestId !== State.cameraRequestId) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraLoading.style.display = 'none';
      cameraError.classList.add('hidden');
      State.cameraReady = true;
      syncCameraToggle();
      startFilterLoop();
      checkMultipleCameras();
      showToast('Camera ready.', 'success');
    } catch (err) {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (requestId === State.cameraRequestId) {
        State.stream = null;
        video.srcObject = null;
        cameraLoading.style.display = 'none';
        handleCameraError(err);
      }
    } finally {
      if (requestId === State.cameraRequestId) {
        State.cameraRequest = null;
        syncCameraToggle();
      }
    }
  })();
  State.cameraRequest = request;
  return request;
}

function syncCameraToggle() {
  const button = $('camera-toggle-btn');
  if (!button) return;
  const active = Boolean(State.cameraReady && State.stream && State.stream.getVideoTracks().some(track => track.readyState === 'live'));
  const label = active ? 'Turn camera off' : 'Turn camera on';
  button.classList.toggle('is-on', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', label);
  button.title = label;
}

function toggleCamera() {
  if (State.capturing) {
    showToast('Wait until the photo finishes before turning the camera off.', 'info');
    return;
  }

  if (State.cameraReady || State.cameraRequest || State.stream) {
    State.cameraPaused = true;
    stopCamera();
    cameraError.classList.add('hidden');
    $('camera-loading-message').textContent = 'Camera is off. Use the camera button to turn it on.';
    cameraLoading.classList.add('camera-is-off');
    cameraLoading.style.display = 'flex';
    showToast('Camera turned off.', 'info');
    return;
  }

  State.cameraPaused = false;
  initCamera();
}

function handleCameraError(err) {
  let msg = 'Unable to access your camera.';
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    msg = 'Camera permission denied. Please allow camera access in your browser settings and try again.';
  } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
    msg = 'No camera found on this device.';
  } else if (err.name === 'NotReadableError') {
    msg = 'Camera is in use by another application.';
  } else if (err.name === 'NotSupportedError') {
    msg = err.message || 'Camera access requires a secure connection (HTTPS or localhost).';
  }
  $('camera-error-msg').textContent = msg;
  cameraError.classList.remove('hidden');
}

async function checkMultipleCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    const section = $('camera-switch-section');
    section.style.display = cams.length > 1 ? 'block' : 'none';
  } catch (_) {}
}

async function flipCamera() {
  const shouldRestart = !State.cameraPaused;
  State.facingMode = State.facingMode === 'user' ? 'environment' : 'user';
  // Mirror flip only for front cam
  video.style.transform = State.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
  focusSensorCanvas.style.transform = State.facingMode === 'user' ? 'scaleX(-1)' : 'none';
  stopCamera();
  if (shouldRestart) await initCamera();
}

function stopCamera() {
  clearTimeout(State.cameraStopTimer);
  State.cameraStopTimer = null;
  State.cameraRequestId += 1;
  State.cameraRequest = null;
  if (State.stream) {
    State.stream.getTracks().forEach(t => t.stop());
    State.stream = null;
  }
  video.srcObject = null;
  cancelAnimationFrame(State.filterLoop);
  State.filterLoop = null;
  State.faceLandmarks = null;
  State.cameraFocusRequested = false;
  State.focusConstraintPending = false;
  clearFocusSensor();
  State.cameraReady = false;
  filterCanvas.style.opacity = '0';
  cameraLoading.style.display = 'none';
  syncCameraToggle();
}

/* ═══════════════════════════════════════════════
   FILTER LOOP (canvas overlay on live video)
═══════════════════════════════════════ */
function startFilterLoop() {
  cancelAnimationFrame(State.filterLoop);
  const sourceWidth = video.videoWidth || 640;
  const sourceHeight = video.videoHeight || 480;
  const scale = Math.min(1, 640 / sourceWidth, 480 / sourceHeight);
  filterCanvas.width = Math.round(sourceWidth * scale);
  filterCanvas.height = Math.round(sourceHeight * scale);
  focusSensorCanvas.width = filterCanvas.width;
  focusSensorCanvas.height = filterCanvas.height;
  focusSensorCanvas.style.transform = State.facingMode === 'user' ? 'scaleX(-1)' : 'none';
  let lastRender = 0;

  function drawFrame(now = 0) {
    if (!State.cameraReady) return;
    State.filterLoop = requestAnimationFrame(drawFrame);

    if (State.faceFocusEnabled && State.faceLandmarker && now - State.lastFaceDetection >= 100) {
      State.lastFaceDetection = now;
      try {
        const result = State.faceLandmarker.detectForVideo(video, now);
        State.faceLandmarks = result.faceLandmarks || [];
        if (State.faceLandmarks.length) {
          clearFocusSensor();
          const focusTarget = drawFocusSensor(focusSensorCanvas.getContext('2d'), State.faceLandmarks[0], focusSensorCanvas.width, focusSensorCanvas.height);
          if (focusTarget && now - State.lastFocusConstraintTime >= 700 && !State.focusConstraintPending) {
            State.lastFocusConstraintTime = now;
            requestCameraFocus(focusTarget.point);
          }
          if (!State.focusConstraintPending) {
            setFaceFocusStatus(State.cameraFocusRequested
              ? 'Face detected. Camera focus is following it.'
              : 'Face detected. Your camera is using its available autofocus.');
          }
        } else {
          clearFocusSensor();
          State.cameraFocusRequested = false;
          setFaceFocusStatus('No face found. Aim the camera at your subject.');
        }
      } catch (error) {
        console.warn('Face focus frame failed:', error);
        State.faceLandmarks = null;
        clearFocusSensor();
        setFaceFocusStatus('Face focus paused. Try turning it off and on again.');
      }
    }

    if (State.filter === 'none') {
      filterCanvas.style.opacity = '0';
      return;
    }
    if (now - lastRender < 1000 / 24) return;
    lastRender = now;
    filterCanvas.style.opacity = '1';
    applyFilterToCanvas(filterCtx, video, filterCanvas.width, filterCanvas.height, State.filter);
  }
  drawFrame();
}

function applyFilterToCanvas(ctx, source, w, h, filter) {
  ctx.clearRect(0, 0, w, h);

  // Mirror front camera
  if (State.facingMode === 'user') {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(source, 0, 0, w, h);
  }

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  switch (filter) {
    case 'bw':
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        data[i] = data[i+1] = data[i+2] = gray;
      }
      break;
    case 'sepia':
      for (let i = 0; i < data.length; i += 4) {
        const r=data[i], g=data[i+1], b=data[i+2];
        data[i]   = Math.min(255, 0.393*r + 0.769*g + 0.189*b);
        data[i+1] = Math.min(255, 0.349*r + 0.686*g + 0.168*b);
        data[i+2] = Math.min(255, 0.272*r + 0.534*g + 0.131*b);
      }
      break;
    case 'vintage':
      for (let i = 0; i < data.length; i += 4) {
        const r=data[i], g=data[i+1], b=data[i+2];
        data[i]   = Math.min(255, 0.393*r + 0.769*g + 0.189*b) * 0.88 + 20;
        data[i+1] = Math.min(255, 0.349*r + 0.686*g + 0.168*b) * 0.85;
        data[i+2] = Math.min(255, 0.272*r + 0.534*g + 0.131*b) * 0.78;
      }
      break;
    case 'neon':
      for (let i = 0; i < data.length; i += 4) {
        data[i]   = Math.min(255, data[i] * 0.5 + 80);
        data[i+1] = Math.min(255, data[i+1] * 0.3);
        data[i+2] = Math.min(255, data[i+2] * 1.8);
      }
      break;
    case 'glow':
      for (let i = 0; i < data.length; i += 4) {
        data[i]   = Math.min(255, data[i]   * 1.3 + 15);
        data[i+1] = Math.min(255, data[i+1] * 1.3 + 15);
        data[i+2] = Math.min(255, data[i+2] * 1.3 + 15);
      }
      break;
    case 'cool':
      for (let i = 0; i < data.length; i += 4) {
        data[i]   = Math.max(0, data[i]   - 20);
        data[i+2] = Math.min(255, data[i+2] + 40);
      }
      break;
    case 'bright':
      for (let i = 0; i < data.length; i += 4) {
        data[i]   = Math.min(255, data[i]   * 1.35);
        data[i+1] = Math.min(255, data[i+1] * 1.35);
        data[i+2] = Math.min(255, data[i+2] * 1.35);
      }
      break;
  }
  ctx.putImageData(imageData, 0, 0);
  drawPhotoEffects(ctx, w, h);
}

function drawPhotoEffects(ctx, width, height) {
  if (State.effects.has('softGlow')) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(width * 0.5, height * 0.38, 0, width * 0.5, height * 0.38, Math.max(width, height) * 0.72);
    glow.addColorStop(0, 'rgba(255,226,205,0.16)');
    glow.addColorStop(1, 'rgba(255,226,205,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  if (State.effects.has('lightLeak')) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const leak = ctx.createLinearGradient(0, 0, width * 0.72, height * 0.5);
    leak.addColorStop(0, 'rgba(255,137,91,0.34)');
    leak.addColorStop(0.28, 'rgba(255,195,119,0.16)');
    leak.addColorStop(0.72, 'rgba(255,195,119,0)');
    ctx.fillStyle = leak;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  if (State.effects.has('vignette')) {
    ctx.save();
    const radius = Math.hypot(width, height) * 0.68;
    const vignette = ctx.createRadialGradient(width / 2, height / 2, radius * 0.3, width / 2, height / 2, radius);
    vignette.addColorStop(0, 'rgba(20,12,22,0)');
    vignette.addColorStop(1, 'rgba(20,12,22,0.5)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

/* ═══════════════════════════════════════════════
   MODE & CONTROLS BINDING
═══════════════════════════════════════ */
function bindModeButtons() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.mode-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      this.classList.add('active'); this.setAttribute('aria-pressed','true');
      State.mode = this.dataset.mode;
      retake();
    });
  });
}

function bindCountdownButtons() {
  document.querySelectorAll('.cd-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.cd-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      this.classList.add('active'); this.setAttribute('aria-pressed','true');
      State.countdown = parseInt(this.dataset.cd, 10);
    });
  });
}

function bindFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
      this.classList.add('active'); this.setAttribute('aria-selected','true');
      State.filter = this.dataset.filter;
    });
  });
}

function bindFrameButtons() {
  document.querySelectorAll('.frame-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.frame-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      this.classList.add('active'); this.setAttribute('aria-pressed','true');
      State.frame = this.dataset.frame;
      applyFrameVisual(State.frame);
    });
  });
}

function bindPhotoEffects() {
  document.querySelectorAll('.effect-btn').forEach(button => {
    button.addEventListener('click', () => {
      const effect = button.dataset.effect;
      const enabled = !State.effects.has(effect);
      if (enabled) State.effects.add(effect);
      else State.effects.delete(effect);
      button.classList.toggle('active', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      if (effect === 'softGlow') cameraWrap.classList.toggle('effect-glow', enabled);
    });
  });
}

function applyFrameVisual(frame) {
  cameraWrap.classList.remove('frame-polaroid','frame-hearts','frame-stars','frame-floral','frame-rainbow','frame-film','frame-confetti','frame-gold');
  if (frame !== 'none') cameraWrap.classList.add('frame-' + frame);
}

function bindBgButtons() {
  document.querySelectorAll('.bg-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.bg-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      this.classList.add('active'); this.setAttribute('aria-pressed','true');
      State.bg = this.dataset.bg;
      applyVirtualBg(State.bg);
    });
  });
}

function applyVirtualBg(bg) {
  // Simplified: tint the video overlay
  const tints = {
    none: '',
    galaxy: 'radial-gradient(ellipse at center, rgba(10,10,50,0.5), rgba(0,0,20,0.7))',
    beach: 'linear-gradient(to bottom, rgba(135,206,235,0.4), rgba(245,222,179,0.4))',
    city: 'linear-gradient(to bottom, rgba(30,30,80,0.5), rgba(80,80,80,0.4))',
    forest: 'linear-gradient(to bottom, rgba(0,80,20,0.4), rgba(0,40,10,0.3))',
    studio: 'linear-gradient(135deg, rgba(180,140,255,0.3), rgba(255,140,200,0.3))',
  };
  frameOverlay.style.background = tints[bg] || '';
}

function applyTheme(theme) {
  State.theme = theme;
  $('booth-layout').className = $('booth-layout').className.replace(/\btheme-\S+/g, '');
  const themeTexts = { wedding: '💍 Wedding', birthday: '🎂 Happy Birthday!', graduation: '🎓 Congratulations!', corporate: '💼 Corporate Event' };
  if (theme !== 'none') {
    $('booth-layout').classList.add('theme-' + theme);
    themeOverlay.textContent = themeTexts[theme] || '';
    themeOverlay.style.display = 'block';
  } else {
    themeOverlay.textContent = '';
    themeOverlay.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════ */
function bindKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const onboardingOpen = !$('onboarding-modal').classList.contains('hidden');
    const resultOpen = !resultPanel.classList.contains('hidden');
    const sequenceViewerOpen = !sequenceViewer.classList.contains('hidden');
    if (e.code === 'Escape') {
      if (onboardingOpen) closeOnboarding();
      else if (sequenceViewerOpen) closeSequenceViewer();
      else if (resultOpen) closeResultPanel();
      return;
    }

    if (sequenceViewerOpen && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      navigateSequenceViewer(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }

    const activeModal = onboardingOpen ? $('onboarding-modal') : sequenceViewerOpen ? sequenceViewer : resultOpen ? resultPanel : null;
    if (activeModal && e.key === 'Tab') {
      const focusable = [...activeModal.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.closest('.hidden') && element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeIndex = focusable.indexOf(document.activeElement);
      if (e.shiftKey && (activeIndex <= 0)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (activeIndex === focusable.length - 1 || activeIndex === -1)) {
        e.preventDefault();
        first.focus();
      }
      return;
    }

    if (activeModal) return;

    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
    if (!State.boothVisible) return;

    switch (e.code) {
      case 'Space':
        if (!resultOpen && State.cameraReady && !State.capturing) { e.preventDefault(); startCapture(); }
        break;
      case 'KeyR':
        if (resultOpen) { e.preventDefault(); retake(); }
        break;
      case 'KeyF':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        cycleFilter(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        cycleFilter(1);
        break;
    }
  });
}

function cycleFilter(dir) {
  const filters = ['none','vintage','bw','sepia','neon','glow','cool','bright'];
  let idx = filters.indexOf(State.filter) + dir;
  if (idx < 0) idx = filters.length - 1;
  if (idx >= filters.length) idx = 0;
  State.filter = filters[idx];
  document.querySelectorAll('.filter-btn').forEach(b => {
    const sel = b.dataset.filter === State.filter;
    b.classList.toggle('active', sel);
    b.setAttribute('aria-selected', String(sel));
  });
}
