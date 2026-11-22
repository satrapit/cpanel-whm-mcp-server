import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const MAX_SECRET_BYTES = 4096;
const MAX_WRAPPED_KEY_BYTES = 8192;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** A data key is wrapped by a separately managed KMS/HSM. This application never stores its KEK. */
export interface DataKeyWrapper {
  wrapKey(dataKey: Buffer): Promise<{ keyId: string; wrappedKey: Buffer }>;
  /** The returned key is a fresh, disposable 32-byte buffer owned by the caller. */
  unwrapKey(keyId: string, wrappedKey: Buffer): Promise<Buffer>;
}

export type CredentialScope = Readonly<{ tenantId: string; connectionId: string }>;

/** The encrypted record may be persisted. The KEK and plaintext must never be persisted with it. */
export type CredentialEnvelope = Readonly<{
  version: 1;
  keyId: string;
  wrappedKey: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}>;

export class CredentialProtectionError extends Error {
  constructor() { super('CREDENTIAL_PROTECTION_FAILED'); this.name = 'CredentialProtectionError'; }
}

function aadFor(scope: CredentialScope): Buffer {
  for (const id of [scope.tenantId, scope.connectionId]) {
    if (typeof id !== 'string' || id.length < 1 || id.length > 128 || !/^[a-zA-Z0-9:_-]+$/.test(id)) {
      throw new CredentialProtectionError();
    }
  }
  // JSON array encoding prevents separator ambiguity across tenant/connection identifiers.
  return Buffer.from(JSON.stringify([1, scope.tenantId, scope.connectionId]), 'utf8');
}

function decodeBase64(value: unknown, maxLength: number): Buffer {
  if (typeof value !== 'string' || value.length < 4 || value.length > Math.ceil(maxLength / 3) * 4 + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new CredentialProtectionError();
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 0 || decoded.length > maxLength || decoded.toString('base64') !== value) {
    throw new CredentialProtectionError();
  }
  return decoded;
}

/** Encrypt with an independent random AES-256-GCM DEK, wrapped by the injected external key service. */
export async function encryptCredential(plaintext: string, scope: CredentialScope, wrapper: DataKeyWrapper): Promise<CredentialEnvelope> {
  const aad = aadFor(scope);
  if (typeof plaintext !== 'string' || !plaintext || Buffer.byteLength(plaintext, 'utf8') > MAX_SECRET_BYTES) {
    throw new CredentialProtectionError();
  }
  const dataKey = randomBytes(KEY_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  try {
    const cipher = createCipheriv('aes-256-gcm', dataKey, nonce);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const { keyId, wrappedKey } = await wrapper.wrapKey(dataKey);
    if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(keyId) || !Buffer.isBuffer(wrappedKey) ||
        wrappedKey.length < 1 || wrappedKey.length > MAX_WRAPPED_KEY_BYTES) throw new CredentialProtectionError();
    return { version: 1, keyId, wrappedKey: wrappedKey.toString('base64'), nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'), tag: tag.toString('base64') };
  } catch {
    throw new CredentialProtectionError();
  } finally {
    dataKey.fill(0);
  }
}

/** Decrypt only for the exact tenant and connection. A wrong scope or tampered record always fails closed. */
export async function decryptCredential(envelope: CredentialEnvelope, scope: CredentialScope, wrapper: DataKeyWrapper): Promise<string> {
  const aad = aadFor(scope);
  let dataKey: Buffer | undefined;
  try {
    if (!envelope || envelope.version !== 1 || typeof envelope.keyId !== 'string' ||
        !/^[a-zA-Z0-9:_-]{1,128}$/.test(envelope.keyId)) throw new CredentialProtectionError();
    const wrappedKey = decodeBase64(envelope.wrappedKey, MAX_WRAPPED_KEY_BYTES);
    const nonce = decodeBase64(envelope.nonce, NONCE_BYTES);
    const tag = decodeBase64(envelope.tag, TAG_BYTES);
    const ciphertext = decodeBase64(envelope.ciphertext, MAX_SECRET_BYTES);
    if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) throw new CredentialProtectionError();
    dataKey = await wrapper.unwrapKey(envelope.keyId, wrappedKey);
    if (!Buffer.isBuffer(dataKey) || dataKey.length !== KEY_BYTES) throw new CredentialProtectionError();
    const decipher = createDecipheriv('aes-256-gcm', dataKey, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new CredentialProtectionError();
  } finally {
    dataKey?.fill(0);
  }
}
