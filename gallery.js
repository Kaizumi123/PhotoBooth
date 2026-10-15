import { loadPhotoLibrary, savePhotoLibrary } from './gallery-store.js';

const $ = id => document.getElementById(id);
const state = {
  photos: [],
  storage: 'indexeddb',
  filter: 'all',
  query: '',
  sort: 'newest',
  activeId: null,
  returnFocus: null,
  deleteId: null,
};

window.addEventListener('DOMContentLoaded', async () => {
  const library = await loadPhotoLibrary();
  state.photos = library.photos;
  state.storage = library.storage;
  loadThemePreference();
  bindControls();
  renderGallery();
  $('copyright-year').textContent = String(new Date().getFullYear());
});

function orderedPhotos() {
  const direction = state.sort === 'oldest' ? 1 : -1;
  return [...state.photos].sort((first, second) => (photoTimestamp(first) - photoTimestamp(second)) * direction);
}

function visiblePhotos() {
  const query = state.query.trim().toLocaleLowerCase();
  return orderedPhotos().filter(photo => {
    if (state.filter === 'favorites' && !photo.favorite) return false;
    if (!query) return true;
    return `${photo.title || ''} ${photo.name || ''} ${formatPhotoDate(photo)}`.toLocaleLowerCase().includes(query);
  });
}

function photoTimestamp(photo) {
  if (Number.isFinite(photo?.createdAt) && photo.createdAt > 0) return photo.createdAt;
  const name = String(photo?.name || '').replace(/^SnapBooth photo\s*/i, '');
  const timestamp = Date.parse(name);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatPhotoDate(photo) {
  const timestamp = photoTimestamp(photo);
  if (!timestamp) return 'Date not available';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}

function renderGallery() {
  const photos = visiblePhotos();
  const grid = $('gallery-grid');
  const fragment = document.createDocumentFragment();

  photos.forEach(photo => fragment.appendChild(createPhotoCard(photo)));
  grid.replaceChildren(fragment);

  const total = state.photos.length;
  const favorites = state.photos.filter(photo => photo.favorite).length;
  $('gallery-total-count').textContent = `${total} ${total === 1 ? 'photo' : 'photos'}`;
  $('gallery-all-count').textContent = String(total);
  $('gallery-favorites-count').textContent = String(favorites);
  $('gallery-empty').classList.toggle('hidden', total > 0);
  $('gallery-no-results').classList.toggle('hidden', total === 0 || photos.length > 0);
  grid.classList.toggle('hidden', photos.length === 0);
  $('gallery-download-all').disabled = total === 0;
  $('gallery-clear-all').disabled = total === 0;
  $('gallery-all-filter').classList.toggle('active', state.filter === 'all');
  $('gallery-favorites-filter').classList.toggle('active', state.filter === 'favorites');
  $('gallery-all-filter').setAttribute('aria-pressed', String(state.filter === 'all'));
  $('gallery-favorites-filter').setAttribute('aria-pressed', String(state.filter === 'favorites'));
  $('gallery-empty-results-title').textContent = state.filter === 'favorites' && !state.query
    ? 'No favorites yet' : 'No matching photos';
  $('gallery-empty-results-copy').textContent = state.filter === 'favorites' && !state.query
    ? 'Tap the heart on any photo to keep it close.' : 'Try another search or show all of your photos.';
  if (state.activeId) renderViewer();
}

function createPhotoCard(photo) {
  const item = document.createElement('article');
  item.className = 'gallery-item';
  item.setAttribute('role', 'listitem');

  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'gallery-preview';
  preview.dataset.action = 'view-photo';
  preview.dataset.photoId = photo.id;
  preview.setAttribute('aria-label', `View ${photo.title || 'saved photo'}`);
  const image = document.createElement('img');
  image.src = photo.data;
  image.alt = photo.title || 'Saved photobooth photo';
  image.loading = 'lazy';
  preview.append(image, Object.assign(document.createElement('span'), {
    className: 'gallery-view-hint', textContent: 'Open photo',
  }));

  const info = document.createElement('div');
  info.className = 'gallery-item-info';
  const title = document.createElement('h3');
  title.className = 'gallery-item-title';
  title.textContent = photo.title || 'SnapBooth moment';
  const date = document.createElement('time');
  date.className = 'gallery-item-date';
  date.dateTime = photoTimestamp(photo) ? new Date(photoTimestamp(photo)).toISOString() : '';
  date.textContent = formatPhotoDate(photo);

  const actions = document.createElement('div');
  actions.className = 'gallery-item-actions';
  const favorite = makeActionButton('gallery-favorite', photo.favorite ? '♥ Saved' : '♡ Favorite', 'toggle-favorite', photo.id);
  favorite.setAttribute('aria-pressed', String(photo.favorite));
  favorite.classList.toggle('is-favorite', photo.favorite);
  const download = makeActionButton('btn-secondary', '↓ Download', 'gallery-download-photo', photo.id);
  const remove = makeActionButton('btn-ghost', 'Delete', 'delete-photo', photo.id);
  actions.append(favorite, download, remove);
  info.append(title, date, actions);
  item.append(preview, info);
  return item;
}

function makeActionButton(className, label, action, photoId) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.photoId = photoId;
  return button;
}

function bindControls() {
  $('gallery-search').addEventListener('input', event => {
    state.query = event.target.value;
    renderGallery();
  });
  $('gallery-sort').addEventListener('change', event => {
    state.sort = event.target.value;
    renderGallery();
  });
  $('gallery-import-input').addEventListener('change', event => {
    const files = [...event.target.files];
    event.target.value = '';
    if (files.length) importPhotos(files);
  });
  document.querySelectorAll('[data-gallery-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.galleryFilter;
      renderGallery();
    });
  });
  document.addEventListener('click', handleAction);
  document.addEventListener('keydown', handleKeyboard);
  $('theme-toggle').addEventListener('click', toggleTheme);
}

function handleAction(event) {
  const target = event.target instanceof Element ? event.target : null;
  const control = target?.closest('[data-action]');
  if (!control) return;
  const id = control.dataset.photoId;
  switch (control.dataset.action) {
    case 'import-photos': $('gallery-import-input').click(); break;
    case 'download-all': downloadAllPhotos(); break;
    case 'clear-gallery': clearGallery(); break;
    case 'view-photo': openViewer(id, control); break;
    case 'toggle-favorite': toggleFavorite(id); break;
    case 'gallery-download-photo': downloadPhoto(id); break;
    case 'share-gallery-photo': sharePhoto(id); break;
    case 'delete-photo': requestDelete(id, control); break;
    case 'close-gallery-viewer': closeViewer(); break;
    case 'gallery-previous': stepViewer(-1); break;
    case 'gallery-next': stepViewer(1); break;
    case 'show-all-gallery':
      state.filter = 'all';
      state.query = '';
      $('gallery-search').value = '';
      renderGallery();
      break;
    case 'close-delete': closeDelete(); break;
    case 'confirm-delete': deletePhoto(); break;
  }
}

async function persist() {
  const result = await savePhotoLibrary(state.photos, state.storage);
  state.storage = result.storage;
  if (!result.ok) showToast('Photo storage is full. Download your photos before saving more.', 'error');
  return result.ok;
}

async function toggleFavorite(id) {
  const photo = state.photos.find(item => item.id === id);
  if (!photo) return;
  photo.favorite = !photo.favorite;
  if (!await persist()) photo.favorite = !photo.favorite;
  else showToast(photo.favorite ? 'Added to favorites.' : 'Removed from favorites.', 'success');
  renderGallery();
}

async function importPhotos(files) {
  const selected = files.slice(0, 12);
  const imported = [];
  let skipped = Math.max(0, files.length - selected.length);
  for (const file of selected) {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.size > 16 * 1024 * 1024) {
      skipped++;
      continue;
    }
    try {
      let data;
      if (file.type === 'image/gif' || !('createImageBitmap' in window)) {
        data = await readFileAsDataUrl(file);
      } else {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 2000 / bitmap.width, 2000 / bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        data = canvas.toDataURL('image/jpeg', 0.88);
      }
      imported.push({
        id: window.crypto?.randomUUID?.() || `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        data,
        name: file.name,
        title: file.name.replace(/\.[^.]+$/, '').trim() || 'Imported photo',
        createdAt: file.lastModified || Date.now(),
        favorite: false,
      });
    } catch (error) {
      console.warn(`Could not import ${file.name}:`, error);
      skipped++;
    }
  }
  if (!imported.length) {
    showToast('No supported photos could be added. Choose image files under 16 MB.', 'error');
    return;
  }
  const previous = state.photos;
  state.photos = [...imported.reverse(), ...previous];
  if (!await persist()) state.photos = previous;
  else {
    state.filter = 'all';
    state.query = '';
    $('gallery-search').value = '';
    showToast(skipped ? `${imported.length} photos added; ${skipped} skipped.` : `${imported.length} photos added to your gallery.`, skipped ? 'info' : 'success');
  }
  renderGallery();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read this photo.'));
    reader.readAsDataURL(file);
  });
}

function openViewer(id, trigger) {
  if (!state.photos.some(photo => photo.id === id)) return;
  state.activeId = id;
  state.returnFocus = trigger;
  $('gallery-viewer').classList.remove('hidden');
  document.body.classList.add('gallery-viewer-open');
  renderViewer();
  $('gallery-viewer-close').focus();
}

function renderViewer() {
  const photo = state.photos.find(item => item.id === state.activeId);
  if (!photo) return closeViewer();
  const ordered = orderedPhotos();
  const index = ordered.findIndex(item => item.id === photo.id);
  const image = $('gallery-viewer-image');
  image.src = photo.data;
  image.alt = photo.title || 'Saved photobooth photo';
  $('gallery-viewer-title').textContent = photo.title || 'SnapBooth moment';
  $('gallery-viewer-date').textContent = formatPhotoDate(photo);
  $('gallery-viewer-count').textContent = `${index + 1} of ${ordered.length}`;
  const favorite = $('gallery-viewer-favorite');
  favorite.dataset.photoId = photo.id;
  favorite.setAttribute('aria-pressed', String(photo.favorite));
  favorite.classList.toggle('is-favorite', photo.favorite);
  favorite.textContent = photo.favorite ? '♥ Saved' : '♡ Favorite';
  ['gallery-viewer-download', 'gallery-viewer-share', 'gallery-viewer-delete'].forEach(id => {
    $(id).dataset.photoId = photo.id;
  });
  $('gallery-viewer-previous').disabled = ordered.length < 2;
  $('gallery-viewer-next').disabled = ordered.length < 2;
}

function stepViewer(direction) {
  const ordered = orderedPhotos();
  if (ordered.length < 2) return;
  const index = ordered.findIndex(photo => photo.id === state.activeId);
  state.activeId = ordered[(index + direction + ordered.length) % ordered.length].id;
  renderViewer();
}

function closeViewer() {
  $('gallery-viewer').classList.add('hidden');
  document.body.classList.remove('gallery-viewer-open');
  $('gallery-viewer-image').removeAttribute('src');
  state.activeId = null;
  const focusTarget = state.returnFocus;
  state.returnFocus = null;
  if (focusTarget instanceof HTMLElement && focusTarget.isConnected) focusTarget.focus();
  else $('gallery-title').focus({ preventScroll: true });
}

function requestDelete(id, trigger) {
  if (state.activeId) {
    const cardTrigger = state.returnFocus;
    $('gallery-viewer').classList.add('hidden');
    document.body.classList.remove('gallery-viewer-open');
    $('gallery-viewer-image').removeAttribute('src');
    state.activeId = null;
    state.returnFocus = cardTrigger;
  } else {
    state.returnFocus = trigger;
  }
  state.deleteId = id;
  $('delete-modal').classList.remove('hidden');
  $('delete-modal').querySelector('[data-action="close-delete"]').focus();
}

function closeDelete() {
  $('delete-modal').classList.add('hidden');
  state.deleteId = null;
  if (state.returnFocus instanceof HTMLElement && state.returnFocus.isConnected) state.returnFocus.focus();
  else $('gallery-title').focus({ preventScroll: true });
}

async function deletePhoto() {
  if (!state.deleteId) return closeDelete();
  const previous = state.photos;
  state.photos = state.photos.filter(photo => photo.id !== state.deleteId);
  const success = await persist();
  if (!success) state.photos = previous;
  else state.returnFocus = null;
  closeDelete();
  renderGallery();
  if (success) {
    const nextPhoto = $('gallery-grid').querySelector('.gallery-preview');
    (nextPhoto || $('gallery-title')).focus({ preventScroll: true });
    showToast('Photo deleted.', 'success');
  }
}

async function clearGallery() {
  if (!state.photos.length || !window.confirm('Clear all saved photos from this device?')) return;
  const previous = state.photos;
  state.photos = [];
  if (!await persist()) state.photos = previous;
  else showToast('Gallery cleared.', 'success');
  renderGallery();
}

function downloadPhoto(id) {
  const photo = state.photos.find(item => item.id === id);
  if (!photo) return;
  downloadData(photo.data, `snapbooth-${photo.id}.${fileExtension(photo.data)}`);
}

function downloadAllPhotos() {
  orderedPhotos().forEach((photo, index) => {
    setTimeout(() => downloadData(photo.data, `snapbooth-${index + 1}.${fileExtension(photo.data)}`), index * 250);
  });
}

function downloadData(data, name) {
  const link = document.createElement('a');
  link.href = data;
  link.download = name;
  link.click();
}

function fileExtension(data) {
  return data.startsWith('data:image/gif') ? 'gif' : data.startsWith('data:image/jpeg') ? 'jpg' : 'png';
}

async function sharePhoto(id) {
  const photo = state.photos.find(item => item.id === id);
  if (!photo) return;
  try {
    const blob = await (await fetch(photo.data)).blob();
    const extension = blob.type === 'image/gif' ? 'gif' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
    const file = new File([blob], `snapbooth.${extension}`, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: photo.title || 'My SnapBooth photo' });
    } else downloadPhoto(id);
  } catch (error) {
    if (error.name !== 'AbortError') downloadPhoto(id);
  }
}

function handleKeyboard(event) {
  const viewerOpen = !$('gallery-viewer').classList.contains('hidden');
  const deleteOpen = !$('delete-modal').classList.contains('hidden');
  const modal = deleteOpen ? $('delete-modal') : viewerOpen ? $('gallery-viewer') : null;
  if (event.key === 'Escape') {
    if (deleteOpen) closeDelete();
    else if (viewerOpen) closeViewer();
    return;
  }
  if (modal && event.key === 'Tab') {
    const focusable = [...modal.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)')]
      .filter(element => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return;
  }
  if (viewerOpen && event.key === 'ArrowLeft') { event.preventDefault(); stepViewer(-1); }
  else if (viewerOpen && event.key === 'ArrowRight') { event.preventDefault(); stepViewer(1); }
}

function loadThemePreference() {
  try {
    const prefs = JSON.parse(localStorage.getItem('sb_prefs') || '{}');
    if (prefs.light) {
      document.body.classList.add('light-mode');
      $('theme-toggle').textContent = '☀️';
    }
  } catch (_) {}
}

function toggleTheme() {
  const light = document.body.classList.toggle('light-mode');
  $('theme-toggle').textContent = light ? '☀️' : '🌙';
  try {
    const prefs = JSON.parse(localStorage.getItem('sb_prefs') || '{}');
    prefs.light = light;
    localStorage.setItem('sb_prefs', JSON.stringify(prefs));
  } catch (_) {}
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $('toast-container').appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
