import { readUpstreamJson, UpstreamError, type UpstreamConnection } from '../security/upstream.js';

const domainName = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const obj = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseDomainList(response: unknown): { domains: string[]; truncated: boolean } {
  if (!obj(response) || response.module !== 'DomainInfo' || response.func !== 'list_domains' || !obj(response.result) || response.result.status !== 1 || !obj(response.result.data)) {
    throw new UpstreamError('UPSTREAM_INVALID_RESPONSE');
  }
  const data = response.result.data;
  const names: unknown[] = [data.main_domain];
  for (const key of ['addon_domains', 'parked_domains', 'sub_domains']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) throw new UpstreamError('UPSTREAM_INVALID_RESPONSE');
    if (Array.isArray(data[key])) names.push(...data[key]);
  }
  const valid = names.filter((name): name is string => typeof name === 'string' && name.length <= 253 && domainName.test(name));
  return { domains: [...new Set(valid)].slice(0, 50), truncated: valid.length > 50 };
}

/** cPanel UAPI: DomainInfo::list_domains. Only a reviewed constant path is callable. */
export async function listCpanelDomains(connection: UpstreamConnection): Promise<{domains:string[];truncated:boolean}> {
  return parseDomainList(await readUpstreamJson(connection, '/execute/DomainInfo/list_domains'));
}
