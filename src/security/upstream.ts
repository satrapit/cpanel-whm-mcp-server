import * as https from 'node:https';
import { resolvePublicEndpoint, type Resolver } from './network.js';

export type UpstreamConnection = Readonly<{
  hostname: string;
  username: string;
  token: string;
  kind: 'cpanel' | 'whm';
}>;

export class UpstreamError extends Error {
  constructor(readonly code: 'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_REJECTED' | 'UPSTREAM_INVALID_RESPONSE') {
    super(code); this.name = 'UpstreamError';
  }
}

/** This transport only accepts allowlisted paths supplied by typed provider adapters. No arbitrary URL routing. */
export async function readUpstreamJson(
  connection: UpstreamConnection,
  path: string,
  resolver?: Resolver,
): Promise<unknown> {
  const allowedPaths: Readonly<Record<UpstreamConnection['kind'], string>> = {
    cpanel: '/execute/DomainInfo/list_domains',
    whm: '/json-api/listaccts?api.version=1&api.chunk.enable=1&api.chunk.size=20&api.chunk.start=1&api.columns.enable=1&api.columns.a=user&api.columns.b=domain',
  };
  if (allowedPaths[connection.kind] !== path) {
    throw new UpstreamError('UPSTREAM_REJECTED');
  }
  // Reject control bytes, whitespace and oversized secrets before allocating an HTTP request.
  if (!/^[a-z0-9_]{1,16}$/.test(connection.username) || typeof connection.token !== 'string' ||
      !/^[\x21-\x7e]{1,4096}$/.test(connection.token)) {
    throw new UpstreamError('UPSTREAM_REJECTED');
  }
  const address = await resolvePublicEndpoint(connection.hostname, resolver);
  const port = connection.kind === 'cpanel' ? 2083 : 2087;
  const header = `${connection.kind === 'cpanel' ? 'cpanel' : 'whm'} ${connection.username}:${connection.token}`;
  const payload = await new Promise<string>((resolve, reject) => {
    const request = https.request({
      hostname: connection.hostname, port, path, method: 'GET',
      // DNS is revalidated on every request, and a validated address is pinned at connect.
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
      rejectUnauthorized: true,
      agent: false,
      timeout: 8_000,
      headers: { Authorization: header, Accept: 'application/json', 'User-Agent': 'cpanel-whm-mcp-server/0.1' },
    }, response => {
      if (response.statusCode !== 200 || !/^application\/json\b/i.test(String(response.headers['content-type'] ?? ''))) {
        response.resume(); reject(new UpstreamError('UPSTREAM_REJECTED')); return;
      }
      let body = '';
      let bodyBytes = 0;
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        bodyBytes += Buffer.byteLength(chunk, 'utf8');
        if (bodyBytes > 256 * 1024) {
          response.destroy(new UpstreamError('UPSTREAM_INVALID_RESPONSE'));
          return;
        }
        body += chunk;
      });
      response.on('end', () => resolve(body));
      response.on('error', reject);
    });
    // Socket inactivity timeout alone does not stop a slow upstream sending endless partial data.
    const deadline = setTimeout(() => request.destroy(new UpstreamError('UPSTREAM_UNAVAILABLE')), 10_000);
    request.once('close', () => clearTimeout(deadline));
    request.on('timeout', () => request.destroy(new UpstreamError('UPSTREAM_UNAVAILABLE')));
    request.on('error', reject);
    request.end();
  }).catch(() => { throw new UpstreamError('UPSTREAM_UNAVAILABLE'); });
  try { return JSON.parse(payload) as unknown; }
  catch { throw new UpstreamError('UPSTREAM_INVALID_RESPONSE'); }
}
