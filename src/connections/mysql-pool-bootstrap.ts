import { buildMariaDbReadPoolOptions, type MariaDbReadSettings, type SecureReadPoolOptions } from './mysql-pool-policy.js';
import { MySql2PreparedReadSql } from './mysql2-read-sql.js';
import { MySqlReadConnectionRepository } from './mysql-read-repository.js';
import { MySqlEncryptedCredentialVault } from './mysql-encrypted-vault.js';
import type { DataKeyWrapper } from '../security/credential-envelope.js';

interface MariaDbSession {
  query(sql: string): Promise<readonly [unknown, unknown]>;
  release(): void;
}
export interface MariaDbPool {
  getConnection(): Promise<MariaDbSession>;
  execute(sql: string, values: string[]): Promise<readonly [unknown, unknown]>;
  end(): Promise<void>;
}
export interface MariaDbPoolFactory {
  createPool(options: SecureReadPoolOptions): MariaDbPool;
}
export class MariaDbConnectionError extends Error {
  constructor() { super('MARIADB_SECURE_CONNECTION_FAILED'); this.name = 'MariaDbConnectionError'; }
}

/**
 * Construct a real driver-backed boundary only after strict TLS preflight.
 * The public MCP runtime does NOT call this function until onboarding and
 * external KMS grants are implemented. A SQL read-only account is mandatory.
 */
export async function openMariaDbReadBoundary(
  config: MariaDbReadSettings, keyWrapper: DataKeyWrapper, factory: MariaDbPoolFactory,
) {
  const options = buildMariaDbReadPoolOptions(config);
  let pool: MariaDbPool | undefined;
  try {
    pool = factory.createPool(options);
    const session = await pool.getConnection();
    try {
      const [rows] = await session.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
      if (!Array.isArray(rows) || rows.length !== 1 ||
          !rows[0] || typeof rows[0] !== 'object' ||
          typeof (rows[0] as { Value?: unknown }).Value !== 'string' ||
          !(rows[0] as { Value: string }).Value) throw new Error('TLS_MISSING');
    } finally { session.release(); }
    const db = new MySql2PreparedReadSql({
      async execute(sql, values) { return await pool!.execute(sql, [...values]); },
    });
    return {
      connections: new MySqlReadConnectionRepository(db),
      vault: new MySqlEncryptedCredentialVault(db, keyWrapper),
      async close() { await pool!.end(); },
    };
  } catch {
    if (pool) { try { await pool.end(); } catch { /* do not leak close errors */ } }
    throw new MariaDbConnectionError();
  }
}
