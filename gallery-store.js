const DB_NAME = 'snapbooth-gallery';
const DB_VERSION = 1;

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is unavailable.'));

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('records')) {
        database.createObjectStore('records', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error('Could not open the photo library.'));
    request.onblocked = () => reject(new Error('The photo library is busy in another tab.'));
  });
}

function normalizePhotos(photos) {
  return (Array.isArray(photos) ? photos : [])
    .filter(photo => photo && typeof photo.data === 'string')
    .map((photo, index) => ({
      ...photo,
      id: String(photo.id || `saved-${index}`),
      createdAt: getPhotoTimestamp(photo),
      favorite: photo.favorite === true,
    }));
}

function getPhotoTimestamp(photo) {
  if (Number.isFinite(photo?.createdAt) && photo.createdAt > 0 && Number.isFinite(new Date(photo.createdAt).getTime())) {
    return photo.createdAt;
  }
  const savedName = String(photo?.name || '').replace(/^SnapBooth photo\s*/i, '');
  const parsed = Date.parse(savedName);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readLegacyPhotos() {
  try {
    const saved = JSON.parse(localStorage.getItem('sb_gallery') || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.warn('Could not read the previous photo library:', error);
    return [];
  }
}

function readLegacyDeletedPhotos() {
  try {
    const saved = JSON.parse(localStorage.getItem('sb_gallery_deleted') || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.warn('Could not read recently deleted photos:', error);
    return [];
  }
}

async function readDatabasePhotos() {
  const database = await openDatabase();
  const transaction = database.transaction('records', 'readonly');
  const store = transaction.objectStore('records');
  const galleryRequest = store.get('gallery');
  const deletedRequest = store.get('recently-deleted');
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve({
      photos: galleryRequest.result?.photos ?? null,
      deletedPhotos: deletedRequest.result?.photos ?? [],
    });
    transaction.onerror = () => reject(transaction.error || new Error('Could not read saved photos.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not read saved photos.'));
  });
}

async function writeDatabasePhotos(photos, deletedPhotos = []) {
  const database = await openDatabase();
  const transaction = database.transaction('records', 'readwrite');
  const completed = new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Photo library transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Photo library transaction was canceled.'));
  });
  transaction.objectStore('records').put({ key: 'gallery', photos });
  transaction.objectStore('records').put({ key: 'recently-deleted', photos: deletedPhotos });
  await completed;
}

export async function loadPhotoLibrary() {
  let useLocalFallback = false;
  try { useLocalFallback = localStorage.getItem('sb_gallery_fallback') === '1'; } catch (_) {}
  if (useLocalFallback) return {
    photos: normalizePhotos(readLegacyPhotos()),
    deletedPhotos: normalizePhotos(readLegacyDeletedPhotos()),
    storage: 'local',
  };

  try {
    const saved = await readDatabasePhotos();
    if (saved.photos !== null) return {
      photos: normalizePhotos(saved.photos),
      deletedPhotos: normalizePhotos(saved.deletedPhotos),
      storage: 'indexeddb',
    };

    const legacy = readLegacyPhotos();
    const deleted = readLegacyDeletedPhotos();
    await writeDatabasePhotos(legacy, deleted);
    try { localStorage.removeItem('sb_gallery'); localStorage.removeItem('sb_gallery_deleted'); } catch (_) {}
    return { photos: normalizePhotos(legacy), deletedPhotos: normalizePhotos(deleted), storage: 'indexeddb' };
  } catch (error) {
    console.warn('Using browser storage fallback for the photo library:', error);
    return { photos: normalizePhotos(readLegacyPhotos()), deletedPhotos: normalizePhotos(readLegacyDeletedPhotos()), storage: 'local' };
  }
}

export async function savePhotoLibrary(photos, preferredStorage = 'indexeddb', deletedPhotos = []) {
  try {
    if (preferredStorage !== 'local') {
      await writeDatabasePhotos(photos, deletedPhotos);
      try {
        localStorage.removeItem('sb_gallery');
        localStorage.removeItem('sb_gallery_deleted');
        localStorage.removeItem('sb_gallery_fallback');
      } catch (_) {}
      return { ok: true, storage: 'indexeddb' };
    }
  } catch (error) {
    console.warn('Could not save photos in IndexedDB; trying browser storage:', error);
  }

  try {
    localStorage.setItem('sb_gallery', JSON.stringify(photos));
    localStorage.setItem('sb_gallery_deleted', JSON.stringify(deletedPhotos));
    localStorage.setItem('sb_gallery_fallback', '1');
    return { ok: true, storage: 'local' };
  } catch (error) {
    console.warn('Could not save photos in browser storage:', error);
    return { ok: false, storage: 'local' };
  }
}
