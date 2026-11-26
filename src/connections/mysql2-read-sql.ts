import type { ReadOnlyConnectionSql } from './mysql-read-repository.js';
import { CONNECTION_READ_SQL } from './connection-queries.js';
import { CREDENTIAL_LOOKUP_SQL } from './credential-lookup-query.js';

/** Contract implemented by mysql2/promise pools, enabling real prepared statements. */
export interface PreparedReadPool {
  execute(sql: string, values: readonly string[]): Promise<readonly [unknown, unknown]>;
}

export class DatabaseReadError extends Error {
  constructor() { super('DATABASE_READ_FAILED'); this.name = 'DatabaseReadError'; }
}

const MAX_ROWS = 100;
const SQL_WHITELIST = new Set<string>([
  ...Object.values(CONNECTION_READ_SQL),
  CREDENTIAL_LOOKUP_SQL,
]);

/**
 * Driver bridge for a mysql2/promise pool. Caller must configure an isolated,
 * read-only database user and pool-level connection/TLS timeouts.
 * Never accepts arbitrary SQL, statements, identifiers or user-controlled paths.
 */
export class MySql2PreparedReadSql implements ReadOnlyConnectionSql {
  constructor(private readonly pool: PreparedReadPool) {}

  async select(sql: string, parameters: readonly string[]): Promise<readonly Readonly<Record<string, unknown>>[]> {
    if (!SQL_WHITELIST.has(sql) || !Array.isArray(parameters) ||
        parameters.length !== (sql.match(/\?/g)?.length ?? 0) ||
        parameters.some(p => typeof p !== 'string' || p.length === 0 || p.length > 255)) {
      throw new DatabaseReadError();
    }
    try {
      // mysql2 execute() uses server-side prepared statements (rather than string interpolation).
      const [rows] = await this.pool.execute(sql, parameters);
      if (!Array.isArray(rows) || rows.length > MAX_ROWS || rows.some(row =>
        !row || typeof row !== 'object' || Array.isArray(row) || Buffer.isBuffer(row))) {
        throw new DatabaseReadError();
      }
      return Object.freeze(rows.map(row => Object.freeze({ ...row as Record<string, unknown> })));
    } catch {
      // Never surface SQL driver errors, credentials, table names, or raw records.
      throw new DatabaseReadError();
    }
  }
}
