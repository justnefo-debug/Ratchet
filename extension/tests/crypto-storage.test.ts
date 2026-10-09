/**
 * Ratchet Privacy Shield — AES-GCM WebCrypto Storage Unit Tests
 *
 * Verifies:
 * 1. AES-GCM encryption with non-extractable 256-bit CryptoKey
 * 2. Successful decryption of encrypted conversation mapping
 * 3. Fresh random IV per encryption (different ciphertexts for identical plaintext)
 * 4. Expiry TTL pruning (expired records return null)
 * 5. Tampered ciphertext rejection (fails closed, returns null)
 */

import { describe, it, expect } from 'vitest';
import {
  getOrCreateCryptoKey,
  encryptMapping,
  decryptMapping,
  type EncryptedMappingRecord,
} from '../src/background/crypto-storage';
import type { ConversationMapping } from '../src/shared/types';

describe('AES-GCM WebCrypto Storage (Stage 4.2)', () => {
  const sampleMapping: ConversationMapping = {
    conversationId: 'conv-crypto-test-1',
    siteOrigin: 'https://chatgpt.com',
    entries: [
      { placeholder: '«EMAIL_1»', original: 'secret.user@vault.io', type: 'EMAIL' },
      { placeholder: '«API_KEY_1»', original: 'sk-proj-supersecretkey12345', type: 'API_KEY' },
    ],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };

  it('generates a non-extractable 256-bit AES-GCM CryptoKey', async () => {
    const key = await getOrCreateCryptoKey();
    expect(key).toBeTruthy();
    expect(key.algorithm.name).toBe('AES-GCM');
    // Critical security constraint: key must NOT be extractable via exportKey
    expect(key.extractable).toBe(false);
  });

  it('encrypts mapping and produces base64 ciphertext with distinct IV', async () => {
    const encrypted = await encryptMapping(sampleMapping, 24);
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.expiresAt).toBeGreaterThan(Date.now());

    // Ciphertext must NOT contain raw secrets in plaintext
    expect(encrypted.ciphertext).not.toContain('secret.user@vault.io');
    expect(encrypted.ciphertext).not.toContain('sk-proj-supersecretkey12345');

    // Fresh IV: Encrypting the same mapping again produces different ciphertext & IV
    const encrypted2 = await encryptMapping(sampleMapping, 24);
    expect(encrypted2.iv).not.toBe(encrypted.iv);
    expect(encrypted2.ciphertext).not.toBe(encrypted.ciphertext);
  });

  it('decrypts valid ciphertext back to the original mapping', async () => {
    const encrypted = await encryptMapping(sampleMapping, 24);
    const decrypted = await decryptMapping(encrypted);

    expect(decrypted).not.toBeNull();
    expect(decrypted?.conversationId).toBe(sampleMapping.conversationId);
    expect(decrypted?.entries).toEqual(sampleMapping.entries);
  });

  it('enforces expiry setting: expired records return null', async () => {
    const encrypted = await encryptMapping(sampleMapping, 24);

    // Artificially set expiry to past timestamp
    const expiredRecord: EncryptedMappingRecord = {
      ...encrypted,
      expiresAt: Date.now() - 5000, // Expired 5 seconds ago
    };

    const result = await decryptMapping(expiredRecord);
    expect(result).toBeNull();
  });

  it('fails closed (returns null) on tampered or corrupted ciphertext', async () => {
    const encrypted = await encryptMapping(sampleMapping, 24);

    // Tamper with ciphertext bytes
    const tamperedRecord: EncryptedMappingRecord = {
      ...encrypted,
      ciphertext: 'corrupted-base64-content==',
    };

    const result = await decryptMapping(tamperedRecord);
    expect(result).toBeNull();
  });
});
