import type { VerifiedAccessToken } from './resource-policy.js';

function fail(): never { throw new Error('INVALID_TOKEN_CLAIMS'); }

/**
 * Normalize only claims from a signature-verified JWT. This does NOT verify signatures or issuer;
 * callers MUST first use jose.jwtVerify with the configured issuer, audience and algorithms.
 */
export function parseVerifiedClaims(payload: Record<string, unknown>, expectedResource: string): VerifiedAccessToken {
  const resource = new URL(expectedResource);
  const { sub, tenant_id: tenantId, exp, aud, scope, client_id: clientIdClaim, azp } = payload;
  const clientId = typeof clientIdClaim === 'string' ? clientIdClaim : azp;
  const audiences = typeof aud === 'string' ? [aud] : Array.isArray(aud) ? aud : [];
  if (typeof sub !== 'string' || sub.length < 1 || sub.length > 256 ||
      typeof tenantId !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(tenantId) ||
      typeof clientId !== 'string' || clientId.length < 1 || clientId.length > 256 ||
      typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= Math.floor(Date.now() / 1000) ||
      !audiences.includes(resource.href)) fail();
  // Deliberately reject unsupported scope representations rather than assuming privileges.
  const scopes = typeof scope === 'string' && scope.length <= 4096
    ? scope.split(' ').filter(Boolean)
    : [];
  return {
    principal: { sub, tenantId, scopes },
    clientId,
    expiresAt: exp,
    resource,
  };
}
