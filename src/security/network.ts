import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeEndpointError extends Error {
  constructor() { super('Outbound endpoint is not permitted'); this.name = 'UnsafeEndpointError'; }
}

/** Only DNS names are accepted in this milestone. IP literals and IPv6 upstreams are denied. */
export function assertHostname(value: string): string {
  if (value.length < 4 || value.length > 253 || value !== value.toLowerCase() || !/^[a-z0-9.-]+$/.test(value) || isIP(value) || value.endsWith('.') || value.includes('..')) {
    throw new UnsafeEndpointError();
  }
  if (value.split('.').some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) throw new UnsafeEndpointError();
  if (value.split('.').length < 2) throw new UnsafeEndpointError();
  return value;
}

/** Fail closed on every reserved/non-unicast IPv4 range, including shared and documentation space. */
export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const parts = address.split('.').map(Number);
  const a = parts[0]!, b = parts[1]!, c = parts[2]!, d = parts[3]!;
  if ([a,b,c,d].some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  // 192.0.0.0/24, 192.0.2.0/24 and documentation ranges above are denied.
  if (a === 192 && b === 0) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  return true;
}

export type Resolver = (hostname: string) => Promise<readonly string[]>;
export const defaultResolver: Resolver = async hostname => (await dnsLookup(hostname, { all: true, family: 4, verbatim: true })).map(entry => entry.address);

/** Resolve all A records and reject the hostname if any address is unsafe. The selected IP is pinned at connect. */
export async function resolvePublicEndpoint(hostname: string, resolver: Resolver = defaultResolver): Promise<string> {
  assertHostname(hostname);
  const addresses = await resolver(hostname);
  if (addresses.length === 0 || addresses.length > 32 || addresses.some(address => !isPublicIPv4(address))) throw new UnsafeEndpointError();
  return addresses[0]!;
}
