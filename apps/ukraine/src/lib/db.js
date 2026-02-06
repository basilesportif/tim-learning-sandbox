import { openDB } from 'idb';

const DB_NAME = 'ukraine-reading-db';
const DB_VERSION = 1;

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('profiles')) {
      db.createObjectStore('profiles', { keyPath: 'language' });
    }

    if (!db.objectStoreNames.contains('texts')) {
      const texts = db.createObjectStore('texts', { keyPath: 'id' });
      texts.createIndex('language', 'language');
      texts.createIndex('difficulty_score', 'difficulty_score');
    }

    if (!db.objectStoreNames.contains('queued_sessions')) {
      db.createObjectStore('queued_sessions', { keyPath: 'queue_id', autoIncrement: true });
    }

    if (!db.objectStoreNames.contains('meta')) {
      db.createObjectStore('meta', { keyPath: 'key' });
    }
  },
});

export async function putProfile(language, profile) {
  const db = await dbPromise;
  await db.put('profiles', { language, profile, saved_at: new Date().toISOString() });
}

export async function getProfile(language) {
  const db = await dbPromise;
  const row = await db.get('profiles', language);
  return row?.profile || null;
}

export async function putTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return;
  }

  const db = await dbPromise;
  const tx = db.transaction('texts', 'readwrite');

  for (const text of texts) {
    await tx.store.put(text);
  }

  await tx.done;
}

export async function getTextsByLanguage(language) {
  const db = await dbPromise;
  return db.getAllFromIndex('texts', 'language', language);
}

export async function enqueueSession(bundle) {
  const db = await dbPromise;
  return db.add('queued_sessions', {
    ...bundle,
    enqueued_at: new Date().toISOString(),
  });
}

export async function listQueuedSessions() {
  const db = await dbPromise;
  return db.getAll('queued_sessions');
}

export async function removeQueuedSession(queueId) {
  const db = await dbPromise;
  await db.delete('queued_sessions', queueId);
}

export async function setMeta(key, value) {
  const db = await dbPromise;
  await db.put('meta', { key, value, saved_at: new Date().toISOString() });
}

export async function getMeta(key) {
  const db = await dbPromise;
  const row = await db.get('meta', key);
  return row?.value;
}
