import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AppConfig } from '../app/config.js';
import { parseVerifiedClaims } from './token-claims.js';

/** Verify signature, issuer, exact audience and expiry against an external OIDC provider. */
export function createAccessTokenVerifier(config: AppConfig) {
  const jwks = createRemoteJWKSet(new URL(config.OIDC_JWKS_URL), { timeoutDuration: 5_000, cooldownDuration: 30_000 });
  const audience = config.PUBLIC_MCP_URL;
  return async (token: string) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.OIDC_ISSUER,
      audience,
      algorithms: ['RS256', 'ES256'],
      clockTolerance: 5,
      requiredClaims: ['sub', 'exp', 'iat', 'aud'],
    });
    return parseVerifiedClaims(payload, audience);
  };
}
