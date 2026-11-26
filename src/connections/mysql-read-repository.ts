import { assertHostname } from '../security/network.js';
import type { Connection, ConnectionRepository, Principal } from './connection.js';

/** A read-only, parameterized query port. Production adapters MUST bind values, never interpolate them. */
export interface ReadOnlyConnectionSql {
  select(sql: string, parameters: readonly string[]): Promise<readonly Readonly<Record<string, unknown>>[]>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_REF = /^[a-zA-Z0-9:_-]{1,128}$/;
const USERNAME = /^[a-zA-Z0-9_-]{1,32}$/;
const KNOWN_CAPABILITIES = ['cpanel.domains.list', 'whm.accounts.list'] as const;

function safeId(value: unknown, length = 255): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= length &&
    !/[\u0000-\u001f\u007f]/.test(value);
}
function safePrincipal(value: Principal | null | undefined): value is Principal {
  return !!value && safeId(value.sub) && safeId(value.tenantId, 128) &&
    Array.isArray(value.scopes) && value.scopes.includes('mcp:read');
}
function isEnabled(value: unknown): boolean {
  return value === 1 || value === '1' || value === true;
}

/**
 * Tenant-scoped MySQL/MariaDB read repository. It cannot write credentials or bypass grants.
 * Intentionally NOT wired into the live runtime until the encrypted vault, migration and
 * a real prepared-statement SQL adapter have passed integration tests.
 */
export class MySqlReadConnectionRepository implements ConnectionRepository {
  constructor(private readonly db: ReadOnlyConnectionSql) {}

  async isMember(principal: Principal, tenantId: string): Promise<boolean> {
    if (!safePrincipal(principal) || principal.tenantId !== tenantId) return false;
    const rows = await this.db.select(
      `SELECT 1 AS allowed FROM mcp_tenant_memberships
       WHERE tenant_id = ? AND subject = ? AND active = 1 LIMIT 1`,
      [tenantId, principal.sub],
    );
    return rows.length === 1 && isEnabled(rows[0]?.allowed);
  }

  async canAccess(principal: Principal, connectionId: string): Promise<boolean> {
    if (!safePrincipal(principal) || !UUID.test(connectionId)) return false;
    const rows = await this.db.select(
      `SELECT 1 AS allowed FROM mcp_connection_grants AS g
       INNER JOIN mcp_tenant_memberships AS m
         ON m.tenant_id = g.tenant_id AND m.subject = g.subject AND m.active = 1
       INNER JOIN mcp_connections AS c
         ON c.tenant_id = g.tenant_id AND c.id = g.connection_id AND c.enabled = 1
       WHERE g.tenant_id = ? AND g.subject = ? AND g.connection_id = ?
         AND g.active = 1 LIMIT 1`,
      [principal.tenantId, principal.sub, connectionId],
    );
    return rows.length === 1 && isEnabled(rows[0]?.allowed);
  }

  async get(tenantId: string, id: string): Promise<Connection | null> {
    if (!safeId(tenantId, 128) || !UUID.test(id)) return null;
    const rows = await this.db.select(
      `SELECT id, tenant_id, kind, hostname, username, credential_ref, enabled
       FROM mcp_connections WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantId, id],
    );
    if (rows.length !== 1) return null;
    const row = rows[0]!;
    if (row.id !== id || row.tenant_id !== tenantId ||
        (row.kind !== 'cpanel' && row.kind !== 'whm') ||
        typeof row.hostname !== 'string' || typeof row.username !== 'string' || !USERNAME.test(row.username) ||
        typeof row.credential_ref !== 'string' || !SECRET_REF.test(row.credential_ref)) return null;
    let hostname: string;
    try { hostname = assertHostname(row.hostname); } catch { return null; }
    const caps = await this.db.select(
      `SELECT capability FROM mcp_connection_capabilities
       WHERE tenant_id = ? AND connection_id = ? AND verified = 1 LIMIT 3`,
      [tenantId, id],
    );
    if (caps.length > KNOWN_CAPABILITIES.length ||
        caps.some(c => !KNOWN_CAPABILITIES.includes(c.capability as typeof KNOWN_CAPABILITIES[number])) ||
        new Set(caps.map(c => c.capability)).size !== caps.length) return null;
    const verifiedCapabilities = caps.map(c => c.capability as typeof KNOWN_CAPABILITIES[number]);
    // Reject provider-confused capability rows even if a bad migration injected them.
    if (verifiedCapabilities.some(c => row.kind === 'cpanel' ? !c.startsWith('cpanel.') : !c.startsWith('whm.'))) return null;
    return Object.freeze({
      id, tenantId, kind: row.kind, hostname, username: row.username as string,
      credentialRef: row.credential_ref, enabled: isEnabled(row.enabled),
      verifiedCapabilities: Object.freeze(verifiedCapabilities),
    });
  }

  async list(principal: Principal): Promise<readonly Connection[]> {
    if (!safePrincipal(principal) || !await this.isMember(principal, principal.tenantId)) return [];
    const rows = await this.db.select(
      `SELECT c.id FROM mcp_connections AS c
       INNER JOIN mcp_connection_grants AS g
         ON g.tenant_id = c.tenant_id AND g.connection_id = c.id AND g.active = 1
       WHERE c.tenant_id = ? AND g.subject = ? AND c.enabled = 1
       ORDER BY c.id LIMIT 50`,
      [principal.tenantId, principal.sub],
    );
    const result: Connection[] = [];
    for (const row of rows.slice(0, 50)) {
      if (typeof row.id !== 'string' || !UUID.test(row.id)) continue;
      // Revalidate grants at read time, even if the listing query was stale.
      if (!await this.canAccess(principal, row.id)) continue;
      const connection = await this.get(principal.tenantId, row.id);
      if (connection && connection.enabled) result.push(connection);
    }
    return result;
  }
}
