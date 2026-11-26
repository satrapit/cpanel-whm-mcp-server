import type { CredentialVault } from './connection.js';
import type { ReadOnlyConnectionSql } from './mysql-read-repository.js';
import { CREDENTIAL_LOOKUP_SQL } from './credential-lookup-query.js';
import { decryptCredential, CredentialProtectionError,
  type CredentialEnvelope, type CredentialScope, type DataKeyWrapper } from '../security/credential-envelope.js';

const REF = /^[a-zA-Z0-9:_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[a-zA-Z0-9:_-]{1,128}$/;

/**
 * A read-only vault retrieving only encrypted credential envelopes. No KMS key or
 * plaintext is stored in MariaDB. The separate DataKeyWrapper must use external KMS.
 * Not connected to the public runtime until real DB/KMS integration is verified.
 */
export class MySqlEncryptedCredentialVault implements CredentialVault {
  constructor(
    private readonly db: ReadOnlyConnectionSql,
    private readonly keyWrapper: DataKeyWrapper,
  ) {}

  async getSecret(reference: string, scope: CredentialScope): Promise<string> {
    if (typeof reference !== 'string' || !REF.test(reference) ||
        !scope || typeof scope.tenantId !== 'string' || !IDENTIFIER.test(scope.tenantId) ||
        typeof scope.connectionId !== 'string' || !UUID.test(scope.connectionId)) {
      throw new CredentialProtectionError();
    }
    try {
      const rows = await this.db.select(CREDENTIAL_LOOKUP_SQL,
        [scope.tenantId, scope.connectionId, reference]);
      if (rows.length !== 1) throw new CredentialProtectionError();
      const row = rows[0]!;
      // Check returned values in addition to the scoped SQL predicates; fail closed
      // if the database adapter, its fixture or a query result is unexpectedly corrupt.
      if (row.tenant_id !== scope.tenantId || row.connection_id !== scope.connectionId ||
          row.credential_ref !== reference || row.version !== 1 ||
          typeof row.key_id !== 'string' || typeof row.wrapped_key !== 'string' ||
          typeof row.nonce !== 'string' || typeof row.ciphertext !== 'string' ||
          typeof row.tag !== 'string') throw new CredentialProtectionError();
      const envelope: CredentialEnvelope = {
        version: 1, keyId: row.key_id, wrappedKey: row.wrapped_key,
        nonce: row.nonce, ciphertext: row.ciphertext, tag: row.tag,
      };
      return await decryptCredential(envelope, scope, this.keyWrapper);
    } catch {
      // Avoid leaking SQL, ciphertext, KMS identifiers or underlying errors.
      throw new CredentialProtectionError();
    }
  }
}
