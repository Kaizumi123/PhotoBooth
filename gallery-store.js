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

async function readDatabasePhotos() {
  const database = await openDatabase();
  const transaction = database.transaction('records', 'readonly');
  const request = transaction.objectStore('records').get('gallery');
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result?.photos ?? null);
    request.onerror = () => reject(request.error || new Error('Could not read saved photos.'));
  });
}

async function writeDatabasePhotos(photos) {
  const database = await openDatabase();
  const transaction = database.transaction('records', 'readwrite');
  const completed = new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Photo library transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Photo library transaction was canceled.'));
  });
  transaction.objectStore('records').put({ key: 'gallery', photos });
  await completed;
}

export async function loadPhotoLibrary() {
  let useLocalFallback = false;
  try { useLocalFallback = localStorage.getItem('sb_gallery_fallback') === '1'; } catch (_) {}
  if (useLocalFallback) return { photos: normalizePhotos(readLegacyPhotos()), storage: 'local' };

  try {
    const saved = await readDatabasePhotos();
    if (saved !== null) return { photos: normalizePhotos(saved), storage: 'indexeddb' };

    const legacy = readLegacyPhotos();
    await writeDatabasePhotos(legacy);
    try { localStorage.removeItem('sb_gallery'); } catch (_) {}
    return { photos: normalizePhotos(legacy), storage: 'indexeddb' };
  } catch (error) {
    console.warn('Using browser storage fallback for the photo library:', error);
    return { photos: normalizePhotos(readLegacyPhotos()), storage: 'local' };
  }
}

export async function savePhotoLibrary(photos, preferredStorage = 'indexeddb') {
  try {
    if (preferredStorage !== 'local') {
      await writeDatabasePhotos(photos);
      try {
        localStorage.removeItem('sb_gallery');
        localStorage.removeItem('sb_gallery_fallback');
      } catch (_) {}
      return { ok: true, storage: 'indexeddb' };
    }
  } catch (error) {
    console.warn('Could not save photos in IndexedDB; trying browser storage:', error);
  }

  try {
    localStorage.setItem('sb_gallery', JSON.stringify(photos));
    localStorage.setItem('sb_gallery_fallback', '1');
    return { ok: true, storage: 'local' };
  } catch (error) {
    console.warn('Could not save photos in browser storage:', error);
    return { ok: false, storage: 'local' };
  }
}
