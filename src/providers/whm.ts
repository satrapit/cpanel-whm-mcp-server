import { readUpstreamJson, UpstreamError, type UpstreamConnection } from '../security/upstream.js';

const obj = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const username = /^[a-z0-9_]{1,16}$/;
const domainName = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;

export function parseWhmAccounts(response: unknown): { accounts: {user:string;domain:string}[]; truncated: boolean } {
  if (!obj(response) || !obj(response.metadata) || response.metadata.command !== 'listaccts' || response.metadata.result !== 1 || !obj(response.data) || !Array.isArray(response.data.acct)) {
    throw new UpstreamError('UPSTREAM_INVALID_RESPONSE');
  }
  const items: {user:string;domain:string}[] = [];
  for (const account of response.data.acct) {
    if (!obj(account) || typeof account.user !== 'string' || typeof account.domain !== 'string' || !username.test(account.user) || account.domain.length > 253 || !domainName.test(account.domain)) {
      throw new UpstreamError('UPSTREAM_INVALID_RESPONSE');
    }
    if (items.length < 20) items.push({ user: account.user, domain: account.domain });
  }
  return { accounts: items, truncated: response.data.acct.length > 20 };
}

/** WHM API 1: listaccts, with explicit server pagination and narrow fields. */
export async function listWhmAccounts(connection: UpstreamConnection): Promise<{accounts:{user:string;domain:string}[];truncated:boolean}> {
  const raw = await readUpstreamJson(connection, '/json-api/listaccts?api.version=1&api.chunk.enable=1&api.chunk.size=20&api.chunk.start=1&api.columns.enable=1&api.columns.a=user&api.columns.b=domain');
  return parseWhmAccounts(raw);
}
