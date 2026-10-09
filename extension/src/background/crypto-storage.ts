/**
 * Ratchet Privacy Shield — Optional Persistent Storage with AES-GCM WebCrypto
 *
 * Threat Model:
 * AES-GCM WebCrypto encryption with a non-extractable key protects persistent
 * conversation mappings at rest in chrome.storage.local from offline disk inspection,
 * unauthenticated profile extraction, and casual storage inspection. It does not
 * protect against an attacker with live process access, malware running arbitrary
 * code in the user's browser, or compromised extension code running within the
 * same origin context.
 */

import type { ConversationMapping } from '../shared/types';
import { STORAGE_KEY_CONV_PREFIX } from '../shared/constants';

const IDB_NAME = 'RatchetKeyStore';
const IDB_STORE = 'keys';
const KEY_NAME = 'ratchet_aes_key';

let inMemoryKey: CryptoKey | null = null;

/**
 * Open or create IndexedDB store to hold the non-extractable CryptoKey.
 */
function openKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve or generate a non-extractable AES-GCM 256-bit CryptoKey.
 */
export async function getOrCreateCryptoKey(): Promise<CryptoKey> {
  if (inMemoryKey) return inMemoryKey;

  try {
    const db = await openKeyDatabase();
    const storedKey = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(KEY_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (storedKey) {
      inMemoryKey = storedKey;
      return storedKey;
    }

    // Generate new non-extractable key
    const newKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt'],
    );

    // Save to IndexedDB (IndexedDB can store non-extractable CryptoKey objects directly)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(newKey, KEY_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    inMemoryKey = newKey;
    return newKey;
  } catch {
    // Fallback to in-memory non-extractable key if IDB fails
    if (!inMemoryKey) {
      inMemoryKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
    }
    return inMemoryKey;
  }
}

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface EncryptedMappingRecord {
  ciphertext: string;
  iv: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Encrypt conversation mapping using AES-GCM with a fresh 12-byte IV.
 */
export async function encryptMapping(
  mapping: ConversationMapping,
  ttlHours = 24,
): Promise<EncryptedMappingRecord> {
  const key = await getOrCreateCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(mapping));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );

  const now = Date.now();
  return {
    ciphertext: bufferToBase64(cipherBuffer),
    iv: bufferToBase64(iv),
    createdAt: now,
    expiresAt: now + ttlHours * 60 * 60 * 1000,
  };
}

/**
 * Decrypt conversation mapping using AES-GCM and check expiration.
 */
export async function decryptMapping(
  record: EncryptedMappingRecord,
): Promise<ConversationMapping | null> {
  // Check expiry setting
  if (Date.now() > record.expiresAt) {
    return null;
  }

  try {
    const key = await getOrCreateCryptoKey();
    const cipherBytes = base64ToBuffer(record.ciphertext);
    const ivBytes = base64ToBuffer(record.iv);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      cipherBytes,
    );

    const text = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(text) as ConversationMapping;
  } catch {
    return null;
  }
}

/**
 * Save persistent mapping in chrome.storage.local (encrypted).
 */
export async function savePersistentMapping(
  mapping: ConversationMapping,
  ttlHours = 24,
): Promise<void> {
  if (!chrome?.storage?.local) return;
  const encrypted = await encryptMapping(mapping, ttlHours);
  const key = `enc:${STORAGE_KEY_CONV_PREFIX}${mapping.conversationId}`;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: encrypted }, () => resolve());
  });
}

/**
 * Get persistent mapping from chrome.storage.local, decrypting and pruning if expired.
 */
export async function getPersistentMapping(
  conversationId: string,
): Promise<ConversationMapping | null> {
  if (!chrome?.storage?.local) return null;
  const key = `enc:${STORAGE_KEY_CONV_PREFIX}${conversationId}`;

  return new Promise((resolve) => {
    chrome.storage.local.get([key], async (res) => {
      const record = res[key] as EncryptedMappingRecord | undefined;
      if (!record) {
        resolve(null);
        return;
      }

      // Check expiry
      if (Date.now() > record.expiresAt) {
        chrome.storage.local.remove([key], () => resolve(null));
        return;
      }

      const decrypted = await decryptMapping(record);
      if (!decrypted) {
        chrome.storage.local.remove([key], () => resolve(null));
        return;
      }

      resolve(decrypted);
    });
  });
}

/**
 * Clear all persistent encrypted mappings from chrome.storage.local.
 */
export async function clearAllPersistentMappings(): Promise<void> {
  if (!chrome?.storage?.local) return;
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const keysToRemove = Object.keys(items || {}).filter((k) =>
        k.startsWith(`enc:${STORAGE_KEY_CONV_PREFIX}`),
      );
      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, () => resolve());
      } else {
        resolve();
      }
    });
  });
}
