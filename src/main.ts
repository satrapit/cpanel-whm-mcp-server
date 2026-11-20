import { readFileSync } from 'node:fs';
import { createMcpFastifyApp } from '@modelcontextprotocol/fastify';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { loadConfig } from './app/config.js';
import { createAccessTokenVerifier } from './auth/oidc.js';
import { DenyAllRepository } from './connections/connection.js';
import { createToolHandler } from './mcp/tools.js';

const config = loadConfig(process.env);
const packageInfo = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const verifier = createAccessTokenVerifier(config);
const dependencies = {
  connections: new DenyAllRepository(),
  // Deliberately fails closed: no credential-store provisioning until encrypted vault + persistence are implemented.
  vault: { async getSecret(): Promise<string> { throw new Error('SECRET_STORE_NOT_CONFIGURED'); } },
  version: packageInfo.version,
};
const handler = createToolHandler(dependencies);
const nodeHandler = toNodeHandler(handler);
const app = createMcpFastifyApp();
const resourceMetadata = new URL(config.PUBLIC_MCP_URL);
resourceMetadata.pathname = '/.well-known/oauth-protected-resource/mcp';

app.get('/health', async () => ({ status: 'ok' }));
app.get('/version', async () => ({ version: packageInfo.version, mcp: '2026-07-28', status: 'development' }));
app.get('/.well-known/oauth-protected-resource/mcp', async () => ({
  resource: config.PUBLIC_MCP_URL,
  authorization_servers: [config.OIDC_ISSUER],
  scopes_supported: ['mcp:read'],
  bearer_methods_supported: ['header'],
}));

app.all('/mcp', async (request, reply) => {
  const bearer = request.headers.authorization;
  const challenge = `Bearer resource_metadata="${resourceMetadata.toString()}", scope="mcp:read"`;
  if (!bearer || !/^Bearer [A-Za-z0-9._~+\/-]+={0,2}$/.test(bearer)) {
    reply.header('WWW-Authenticate', challenge);
    return reply.code(401).send({ error: 'invalid_token' });
  }
  try {
    const verified = await verifier(bearer.slice(7));
    return nodeHandler(Object.assign(request.raw, {
      auth: { token: bearer.slice(7), clientId: verified.principal.sub, tenantId: verified.principal.tenantId, scopes: verified.principal.scopes, expiresAt: verified.expiresAt, resource: verified.resource },
    }), reply.raw, request.body);
  } catch {
    reply.header('WWW-Authenticate', challenge);
    return reply.code(401).send({ error: 'invalid_token' });
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().then(() => handler.close()); });
}

await app.listen({ host: config.HOST, port: config.PORT });
