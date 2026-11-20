export type Capability = Readonly<{
  id: 'cpanel.domains.list' | 'whm.accounts.list';
  operation: string;
  provider: 'cpanel' | 'whm';
  risk: 'READ';
  docs: string;
  scope: string;
  implemented: boolean;
  published: boolean;
}>;

/** Reviewed functions only; presence here is not an authorization grant. */
export const capabilities: readonly Capability[] = [
  {
    id: 'cpanel.domains.list', operation: 'DomainInfo/list_domains', provider: 'cpanel', risk: 'READ',
    docs: 'https://api.docs.cpanel.net/specifications/cpanel.openapi/', scope: 'mcp:read', implemented: true, published: true,
  },
  {
    id: 'whm.accounts.list', operation: 'listaccts', provider: 'whm', risk: 'READ',
    docs: 'https://api.docs.cpanel.net/specifications/whm.openapi/account-management/accounts-listaccts', scope: 'mcp:read', implemented: true, published: true,
  },
];
