export type Connection = Readonly<{
  id: string;
  tenantId: string;
  kind: 'cpanel' | 'whm';
  hostname: string;
  username: string;
  credentialRef: string;
  enabled: boolean;
  /** Confirmed by the server, never inferred from a client-provided role label. */
  verifiedCapabilities: readonly ('cpanel.domains.list' | 'whm.accounts.list')[];
}>;

export type Principal = Readonly<{ sub: string; tenantId: string; scopes: readonly string[] }>;

/** A storage port; persistent implementation must enforce membership and tenant-scoped queries. */
export interface ConnectionRepository {
  list(principal: Principal): Promise<readonly Connection[]>;
  get(id: string): Promise<Connection | null>;
  isMember(principal: Principal, tenantId: string): Promise<boolean>;
  canAccess(principal: Principal, connectionId: string): Promise<boolean>;
}

export interface CredentialVault {
  getSecret(reference: string): Promise<string>;
}

export class AuthorizationError extends Error {
  constructor() { super('ACCESS_DENIED'); this.name = 'AuthorizationError'; }
}

/** This milestone intentionally has no server-backed credentials or tenant database yet. */
export class DenyAllRepository implements ConnectionRepository {
  async list(): Promise<readonly Connection[]> { return []; }
  async get(): Promise<null> { return null; }
  async isMember(): Promise<boolean> { return false; }
  async canAccess(): Promise<boolean> { return false; }
}

/** Double-check membership and per-object grants; never trust a connection ID or role asserted by an LLM. */
export async function authorizeConnection(
  repo: ConnectionRepository, principal: Principal, id: string, kind: Connection['kind'], capability: Connection['verifiedCapabilities'][number],
): Promise<Connection> {
  if (!principal.scopes.includes('mcp:read')) throw new AuthorizationError();
  const conn = await repo.get(id);
  if (!conn || !conn.enabled || conn.tenantId !== principal.tenantId || conn.kind !== kind || !conn.verifiedCapabilities.includes(capability)) throw new AuthorizationError();
  if (!await repo.isMember(principal, conn.tenantId) || !await repo.canAccess(principal, id)) throw new AuthorizationError();
  return conn;
}
