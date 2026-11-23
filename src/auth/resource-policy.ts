/** Strict transport-layer authorization; it never trusts identity or scopes supplied by the MCP client. */

export interface VerifiedAccessToken {
  principal: Readonly<{ sub: string; tenantId: string; scopes: readonly string[] }>;
  /** OAuth client identifier, distinct from the authenticated end-user subject. */
  clientId: string;
  expiresAt: number;
  resource: URL;
}

export type AccessTokenVerifier = (token: string) => Promise<VerifiedAccessToken>;

export type ResourceAuthorization =
  | Readonly<{ ok: true; identity: VerifiedAccessToken }>
  | Readonly<{
      ok: false;
      status: 401 | 403;
      code: 'invalid_token' | 'insufficient_scope';
      challenge: string;
    }>;

/** Authorization inputs are server-configured, never derived from untrusted forwarded headers. */
export function createResourceAuthorization(resourceUrl: string, verifier: AccessTokenVerifier) {
  const resource = new URL(resourceUrl);
  if (!['https:', 'http:'].includes(resource.protocol) ||
      (resource.protocol === 'http:' && resource.hostname !== '127.0.0.1') ||
      resource.pathname !== '/mcp' || resource.search || resource.hash ||
      resource.username || resource.password) {
    throw new TypeError('INVALID_RESOURCE_CONFIGURATION');
  }
  const metadata = new URL('/.well-known/oauth-protected-resource/mcp', resource);
  const quotedMetadata = metadata.href.replace(/"/g, '%22');
  const deny = (status: 401 | 403): ResourceAuthorization => {
    const code = status === 401 ? 'invalid_token' : 'insufficient_scope';
    const scope = status === 403 ? ', scope="mcp:read"' : '';
    return {
      ok: false,
      status,
      code,
      challenge: 'Bearer error="' + code + '"' + scope + ', resource_metadata="' + quotedMetadata + '"',
    };
  };
  return {
    metadataUrl: metadata.href,
    resource: resource.href,
    /** Bound the token size and reject non-bearer/ambiguous credentials before verifier invocation. */
    async authorize(header: string | undefined): Promise<ResourceAuthorization> {
      if (typeof header !== 'string' || header.length > 8192) return deny(401);
      const match = /^Bearer ([A-Za-z0-9._~+\/-]+={0,2})$/i.exec(header);
      if (!match?.[1]) return deny(401);
      let identity: VerifiedAccessToken;
      try {
        identity = await verifier(match[1]);
      } catch {
        return deny(401);
      }
      // Re-check at the resource boundary. A trusted signature alone is not an access grant.
      if (!identity || !identity.resource || identity.resource.href !== resource.href ||
          !Number.isFinite(identity.expiresAt) || identity.expiresAt <= Date.now() / 1000 ||
          typeof identity.clientId !== 'string' || identity.clientId.length < 1 || identity.clientId.length > 256 ||
          !identity.principal || typeof identity.principal.sub !== 'string' ||
          identity.principal.sub.length < 1 || identity.principal.sub.length > 256 ||
          typeof identity.principal.tenantId !== 'string' ||
          !/^[a-zA-Z0-9:_-]{1,128}$/.test(identity.principal.tenantId) ||
          !Array.isArray(identity.principal.scopes) ||
          identity.principal.scopes.some(scope => typeof scope !== 'string')) {
        return deny(401);
      }
      if (!identity.principal.scopes.includes('mcp:read')) return deny(403);
      return { ok: true, identity };
    },
  };
}
