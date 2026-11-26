/** Exact approved SQL statements. No caller-supplied SQL is executed. */
export const CONNECTION_READ_SQL = Object.freeze({
  MEMBER: `SELECT 1 AS allowed FROM mcp_tenant_memberships
       WHERE tenant_id = ? AND subject = ? AND active = 1 LIMIT 1`,
  GRANT: `SELECT 1 AS allowed FROM mcp_connection_grants AS g
       INNER JOIN mcp_tenant_memberships AS m
         ON m.tenant_id = g.tenant_id AND m.subject = g.subject AND m.active = 1
       INNER JOIN mcp_connections AS c
         ON c.tenant_id = g.tenant_id AND c.id = g.connection_id AND c.enabled = 1
       WHERE g.tenant_id = ? AND g.subject = ? AND g.connection_id = ?
         AND g.active = 1 LIMIT 1`,
  GET: `SELECT id, tenant_id, kind, hostname, username, credential_ref, enabled
       FROM mcp_connections WHERE tenant_id = ? AND id = ? LIMIT 1`,
  CAPABILITIES: `SELECT capability FROM mcp_connection_capabilities
       WHERE tenant_id = ? AND connection_id = ? AND verified = 1 LIMIT 3`,
  LIST: `SELECT c.id FROM mcp_connections AS c
       INNER JOIN mcp_connection_grants AS g
         ON g.tenant_id = c.tenant_id AND g.connection_id = c.id AND g.active = 1
       WHERE c.tenant_id = ? AND g.subject = ? AND c.enabled = 1
       ORDER BY c.id LIMIT 50`,
} as const);
