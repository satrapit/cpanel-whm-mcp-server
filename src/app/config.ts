import { z } from 'zod/v4';

const configSchema = z.object({
  HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  PUBLIC_MCP_URL: z.url().refine(value => {
    const url = new URL(value);
    return url.pathname === '/mcp' && !url.username && !url.password && !url.hash && !url.search &&
      (url.protocol === 'https:' || url.origin === 'http://127.0.0.1:3000' || url.hostname === '127.0.0.1' && url.protocol === 'http:');
  }),
  OIDC_ISSUER: z.url().refine(value => value.startsWith('https://')),
  OIDC_JWKS_URL: z.url().refine(value => value.startsWith('https://')),
});

export type AppConfig = z.output<typeof configSchema>;

/** Startup fails closed if the identity provider or externally visible resource is absent. */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse(env);
}
