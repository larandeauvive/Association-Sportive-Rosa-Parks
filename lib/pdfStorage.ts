// Gestionnaire de stockage local haute capacité (IndexedDB) pour les fichiers PDF joints
// Permet de stocker de gros fichiers PDF sans être limité par les 5 Mo de localStorage

const DB_NAME = 'as_rosa_parks_pdf_db';
const DB_VERSION = 1;
const STORE_NAME = 'session_pdfs';

function openPdfDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB non disponible'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeSessionPdfInLocalDb(sessionId: string, pdfDoc: any): Promise<void> {
  try {
    const db = await openPdfDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ sessionId, ...pdfDoc });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Erreur stockage IndexedDB PDF:', err);
  }
}

export async function getSessionPdfFromLocalDb(sessionId: string): Promise<any | null> {
  try {
    const db = await openPdfDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(sessionId);
      req.onsuccess = () => {
        if (req.result) {
          const { sessionId: _, ...doc } = req.result;
          resolve(doc);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteSessionPdfFromLocalDb(sessionId: string): Promise<void> {
  try {
    const db = await openPdfDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(sessionId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Erreur suppression IndexedDB PDF:', err);
  }
}
