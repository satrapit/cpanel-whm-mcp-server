import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { capabilities } from '../capabilities/registry.js';
import { authorizeConnection, AuthorizationError, type ConnectionRepository, type CredentialVault, type Principal } from '../connections/connection.js';
import { listCpanelDomains } from '../providers/cpanel.js';
import { listWhmAccounts } from '../providers/whm.js';

export interface Dependencies {
  connections: ConnectionRepository;
  vault: CredentialVault;
  version: string;
}

/** Every tool resolves the authenticated caller and connection access server-side. */
export function createToolHandler(deps: Dependencies) {
  return createMcpHandler(({ authInfo }) => {
    const server = new McpServer({ name: 'cpanel-whm-mcp-server', version: deps.version }, { maxToolInputElements: 40 });
    const identity = authInfo as (typeof authInfo & { tenantId?: string }) | undefined;
    const principal: Principal | null = identity?.clientId && identity.tenantId && identity.scopes
      ? { sub: identity.clientId, tenantId: identity.tenantId, scopes: identity.scopes }
      : null;

    server.registerTool('capabilities_list', {
      description: 'List reviewed read-only capability descriptors; listing is not authorization to execute.',
      annotations: { readOnlyHint: true },
    }, async () => ({ content: [{ type: 'text', text: JSON.stringify(capabilities) }] }));

    server.registerTool('connections_list', {
      description: 'List connection identifiers and types visible to the authenticated member; no credentials returned.',
      annotations: { readOnlyHint: true },
    }, async () => {
      if (!principal) return deny();
      const connections = await deps.connections.list(principal);
      const allowed = await Promise.all(connections.slice(0, 100).map(async c => (
        c.tenantId === principal.tenantId && await deps.connections.isMember(principal, c.tenantId) && await deps.connections.canAccess(principal, c.id)
          ? { id: c.id, kind: c.kind, enabled: c.enabled } : null
      )));
      return { content: [{ type: 'text', text: JSON.stringify(allowed.filter(item => item !== null).slice(0, 50)) }] };
    });

    server.registerTool('cpanel_list_domains', {
      description: 'Read up to 50 domains on an owned cPanel connection through UAPI DomainInfo::list_domains. No modifications.',
      inputSchema: z.object({ connectionId: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    }, async ({ connectionId }) => {
      if (!principal) return deny();
      try {
        const connection = await authorizeConnection(deps.connections, principal, connectionId, 'cpanel', 'cpanel.domains.list');
        const token = await deps.vault.getSecret(connection.credentialRef);
        const result = await listCpanelDomains({ kind: 'cpanel', hostname: connection.hostname, username: connection.username, token });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) { return failure(error); }
    });

    server.registerTool('whm_list_accounts', {
      description: 'Read the first 20 account usernames/domains from an authorized WHM connection using listaccts. No modifications.',
      inputSchema: z.object({ connectionId: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    }, async ({ connectionId }) => {
      if (!principal) return deny();
      try {
        const connection = await authorizeConnection(deps.connections, principal, connectionId, 'whm', 'whm.accounts.list');
        const token = await deps.vault.getSecret(connection.credentialRef);
        const result = await listWhmAccounts({ kind: 'whm', hostname: connection.hostname, username: connection.username, token });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) { return failure(error); }
    });
    return server;
  }, { responseMode: 'json' });
}

function deny() {
  return { isError: true, content: [{ type: 'text' as const, text: 'ACCESS_DENIED' }] };
}
function failure(error: unknown) {
  // Prevent remote error messages, token strings and sensitive payloads from entering MCP outputs.
  return { isError: true, content: [{ type: 'text' as const, text: error instanceof AuthorizationError ? 'ACCESS_DENIED' : 'OPERATION_FAILED' }] };
}
