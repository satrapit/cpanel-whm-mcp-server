import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMcpFastifyApp } from '@modelcontextprotocol/fastify';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { loadConfig } from './app/config.js';
import { createAccessTokenVerifier } from './auth/oidc.js';
import { createResourceAuthorization } from './auth/resource-policy.js';
import { DenyAllRepository } from './connections/connection.js';
import { createToolHandler } from './mcp/tools.js';

/** A CommonJS-safe bootstrap for cPanel Passenger and a normal ESM entry for development. */
export async function startServer(): Promise<void> {
  const config = loadConfig(process.env);
  // Passenger app.cjs changes cwd to the application root before invoking this module.
  const packageInfo = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { version: string };
  const version = packageInfo.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    throw new Error('INVALID_APPLICATION_VERSION');
  }
  const auth = createResourceAuthorization(config.PUBLIC_MCP_URL, createAccessTokenVerifier(config));
  const dependencies = {
    connections: new DenyAllRepository(),
    // Explicitly disabled until an independently managed encrypted vault and tenant persistence exist.
    vault: { async getSecret(): Promise<string> { throw new Error('SECRET_STORE_NOT_CONFIGURED'); } },
    version,
  };
  const handler = createToolHandler(dependencies);
  const nodeHandler = toNodeHandler(handler);
  const publicHost = new URL(config.PUBLIC_MCP_URL).hostname;
  // The public hostname may be forwarded by a trusted reverse proxy on loopback.
  const allowedHosts = Array.from(new Set(['127.0.0.1', 'localhost', publicHost]));
  const app = createMcpFastifyApp({ host: config.HOST, allowedHosts, allowedOrigins: allowedHosts });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/version', async () => ({ version, mcp: '2026-07-28', status: 'development' }));
  app.get('/.well-known/oauth-protected-resource/mcp', async () => ({
    resource: auth.resource,
    authorization_servers: [config.OIDC_ISSUER],
    scopes_supported: ['mcp:read'],
    bearer_methods_supported: ['header'],
  }));

  app.all('/mcp', async (request, reply) => {
    // Multiple Authorization headers must not be normalized into an apparently valid single credential.
    if ((request.raw.headersDistinct.authorization?.length ?? 0) > 1) {
      reply.header('WWW-Authenticate', 'Bearer error="invalid_token", resource_metadata="' + auth.metadataUrl + '"');
      return reply.code(401).send({ error: 'invalid_token' });
    }
    const decision = await auth.authorize(request.headers.authorization);
    if (!decision.ok) {
      reply.header('WWW-Authenticate', decision.challenge);
      return reply.code(decision.status).send({ error: decision.code });
    }
    const identity = decision.identity;
    // AuthInfo.clientId means OAuth *client*, not user subject. Custom principal is server-verified.
    const authInfo = {
      token: request.headers.authorization!.slice(7),
      clientId: identity.clientId,
      principal: identity.principal,
      scopes: [...identity.principal.scopes],
      expiresAt: identity.expiresAt,
      resource: identity.resource,
    };
    return nodeHandler(Object.assign(request.raw, { auth: authInfo }), reply.raw, request.body);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app.close().then(() => handler.close()); });
  }
  await app.listen({ host: config.HOST, port: config.PORT });
}

// Deliberately no top-level await: required by the isolated CommonJS Passenger build.
void startServer().catch(() => {
  // Startup errors may contain environment values. Avoid leaking configuration in shared-host logs.
  process.stderr.write('STARTUP_FAILED\n');
  process.exitCode = 1;
});
