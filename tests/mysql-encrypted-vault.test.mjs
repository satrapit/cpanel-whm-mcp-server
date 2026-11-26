import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { MySqlEncryptedCredentialVault } from '../dist-core/connections/mysql-encrypted-vault.js';
import { encryptCredential, CredentialProtectionError } from '../dist-core/security/credential-envelope.js';
import { CREDENTIAL_LOOKUP_SQL } from '../dist-core/connections/credential-lookup-query.js';

const scope = { tenantId: 'tenant1', connectionId: 'b6f882cc-c274-4eb3-9d02-3a76c5bc0a48' };
const reference = 'ref_1';
const kek = randomBytes(32); // Synthetic key, never deploy this KMS stub.
const wrapper = {
  async wrapKey(key) {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', kek, nonce);
    return { keyId: 'synthetic-kms-1', wrappedKey: Buffer.concat([nonce, cipher.update(key), cipher.final(), cipher.getAuthTag()]) };
  },
  async unwrapKey(keyId, blob) {
    if (keyId !== 'synthetic-kms-1') throw new Error('KMS_UNAVAILABLE');
    const nonce = blob.subarray(0, 12), tag = blob.subarray(blob.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', kek, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(blob.subarray(12, -16)), decipher.final()]);
  },
};
const envelope = await encryptCredential('synthetic-provider-token', scope, wrapper);
function database(rows) { const calls = []; return { calls, async select(sql, parameters) { calls.push({sql, parameters}); return rows; } }; }
function validRow() {return {tenant_id:scope.tenantId,connection_id:scope.connectionId,credential_ref:reference,version:1,
  key_id:envelope.keyId,wrapped_key:envelope.wrappedKey,nonce:envelope.nonce,ciphertext:envelope.ciphertext,tag:envelope.tag};}

test('vault reads only an active encrypted envelope within the exact tenant/connection scope', async () => {
  const db = database([validRow()]);
  const vault = new MySqlEncryptedCredentialVault(db, wrapper);
  assert.equal(await vault.getSecret(reference, scope), 'synthetic-provider-token');
  assert.equal(db.calls[0].sql, CREDENTIAL_LOOKUP_SQL);
  assert.deepEqual(db.calls[0].parameters, [scope.tenantId,scope.connectionId,reference]);
  assert.equal(JSON.stringify(validRow()).includes('synthetic-provider-token'), false);
});

test('vault rejects nonexistent/revoked rows and scope impersonation', async () => {
  for (const rows of [[], [validRow(), validRow()], [{...validRow(),tenant_id:'other'}],
      [{...validRow(),connection_id:'b6f882cc-c274-4eb3-9d02-3a76c5bc0a49'}], [{...validRow(),credential_ref:'different'}]]) {
    await assert.rejects(new MySqlEncryptedCredentialVault(database(rows),wrapper).getSecret(reference,scope),CredentialProtectionError);
  }
});

test('vault rejects tampering and invalid metadata without revealing decrypted secrets', async () => {
  for (const rows of [[{...validRow(), tag: Buffer.alloc(16).toString('base64')}],
      [{...validRow(),version:'1'}],[{...validRow(),ciphertext:'bad!'}]]) {
    const vault = new MySqlEncryptedCredentialVault(database(rows),wrapper);
    await assert.rejects(vault.getSecret(reference,scope), e =>
      e instanceof CredentialProtectionError && e.message === 'CREDENTIAL_PROTECTION_FAILED');
  }
});

test('vault blocks malformed scoped inputs before any SQL work', async () => {
  const db = database([validRow()]);
  const vault = new MySqlEncryptedCredentialVault(db,wrapper);
  for (const [ref,sc] of [['../../secret',scope], [reference,{...scope,tenantId:'../../root'}],
      [reference,{...scope,connectionId:'wrong'}]]) {
    await assert.rejects(vault.getSecret(ref,sc),CredentialProtectionError);
  }
  assert.equal(db.calls.length,0);
});

test('vault fails closed and redacts errors when database or KMS fails', async () => {
  const db = {async select(){throw new Error('database host=secret.example.com');}};
  await assert.rejects(new MySqlEncryptedCredentialVault(db,wrapper).getSecret(reference,scope), e =>
    e instanceof CredentialProtectionError && !e.message.includes('secret.example.com'));
  const badWrapper = {...wrapper,async unwrapKey() {throw new Error('KMS secret address');}};
  await assert.rejects(new MySqlEncryptedCredentialVault(database([validRow()]),badWrapper).getSecret(reference,scope), e =>
    e instanceof CredentialProtectionError && !e.message.includes('KMS secret'));
});
