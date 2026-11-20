import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AppConfig } from '../app/config.js';
import type { Principal } from '../connections/connection.js';

export type Authenticated = Readonly<{
  principal: Principal;
  expiresAt: number;
  resource: URL;
}>;

/** Verify signature, issuer, exact audience and expiry against an external OIDC provider. */
export function createAccessTokenVerifier(config: AppConfig) {
  const jwks = createRemoteJWKSet(new URL(config.OIDC_JWKS_URL), { timeoutDuration: 5_000, cooldownDuration: 30_000 });
  const audience = config.PUBLIC_MCP_URL;
  return async (token: string): Promise<Authenticated> => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.OIDC_ISSUER,
      audience,
      algorithms: ['RS256', 'ES256'],
      clockTolerance: 5,
      requiredClaims: ['sub', 'exp', 'iat', 'aud'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || typeof payload.tenant_id !== 'string' || !payload.tenant_id || payload.tenant_id.length > 128) throw new Error('INVALID_TOKEN');
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [];
    if (!scopes.includes('mcp:read')) throw new Error('INSUFFICIENT_SCOPE');
    return {
      principal: { sub: payload.sub, tenantId: payload.tenant_id, scopes },
      expiresAt: payload.exp,
      resource: new URL(audience),
    };
  };
}
