import mysql from 'mysql2/promise';
import type { DataKeyWrapper } from '../security/credential-envelope.js';
import type { MariaDbReadSettings } from '../connections/mysql-pool-policy.js';
import { openMariaDbReadBoundary } from '../connections/mysql-pool-bootstrap.js';

/**
 * mysql2/promise production adapter. Deliberately outside the dependency-light core
 * and never wired by default into main.ts. Requires verified driver installation,
 * audited database grants, controlled onboarding and a real external KMS wrapper.
 */
export async function openMariaDbWithMySql2(config: MariaDbReadSettings, wrapper: DataKeyWrapper) {
  return openMariaDbReadBoundary(config, wrapper, {
    createPool(options) {
      const pool = mysql.createPool(options);
      return {
        async getConnection() {
          const connection = await pool.getConnection();
          return {
            async query(sql: string) { return connection.query(sql); },
            release() { connection.release(); },
          };
        },
        async execute(sql: string, values: string[]) { return pool.execute(sql, values); },
        async end() { await pool.end(); },
      };
    },
  });
}
