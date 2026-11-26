import { assertHostname } from '../security/network.js';

export interface MariaDbReadSettings {
  hostname: string;
  username: string;
  password: string;
  database: string;
  port?: number;
  /** Optional PEM CA bundle managed outside Git. Never a path or a private key. */
  caPem?: string;
}

export class MariaDbConfigurationError extends Error {
  constructor() { super('MARIADB_CONFIGURATION_INVALID'); this.name = 'MariaDbConfigurationError'; }
}

/** Strict remote TLS pool settings. Never accept socketPath or TLS verification bypasses. */
export function buildMariaDbReadPoolOptions(config: MariaDbReadSettings) {
  try {
    if (!config || typeof config.hostname !== 'string') throw new Error();
    const host = assertHostname(config.hostname);
    if (config.port !== undefined && config.port !== 3306) throw new Error();
    if (typeof config.username !== 'string' || !/^[A-Za-z0-9_]{1,32}$/.test(config.username) ||
        typeof config.database !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(config.database) ||
        typeof config.password !== 'string' || !config.password ||
        config.password.length > 4096 || /[\u0000\r\n]/.test(config.password)) throw new Error();
    if (config.caPem !== undefined && (typeof config.caPem !== 'string' ||
        config.caPem.length > 65536 || !config.caPem.includes('-----BEGIN CERTIFICATE-----') ||
        !config.caPem.includes('-----END CERTIFICATE-----') || config.caPem.includes('PRIVATE KEY'))) throw new Error();
    return {
      host, port: 3306, user: config.username, password: config.password, database: config.database,
      ssl: {
        rejectUnauthorized: true as const,
        verifyIdentity: true as const,
        minVersion: 'TLSv1.2' as const,
        ...(config.caPem ? { ca: config.caPem } : {}),
      },
      multipleStatements: false as const,
      waitForConnections: true as const,
      connectionLimit: 4,
      maxIdle: 4,
      idleTimeout: 30000,
      queueLimit: 16,
      connectTimeout: 5000,
      enableKeepAlive: true as const,
    };
  } catch {
    // No partial config or secrets in validation errors.
    throw new MariaDbConfigurationError();
  }
}
export type SecureReadPoolOptions = ReturnType<typeof buildMariaDbReadPoolOptions>;
