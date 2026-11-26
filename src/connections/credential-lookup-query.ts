/** Exact tenant/connection/reference-bound envelope lookup. */
export const CREDENTIAL_LOOKUP_SQL = `SELECT e.tenant_id, e.connection_id, e.credential_ref, e.version,
       e.key_id, e.wrapped_key, e.nonce, e.ciphertext, e.tag
   FROM mcp_credential_envelopes AS e
   INNER JOIN mcp_connections AS c
     ON c.tenant_id = e.tenant_id AND c.id = e.connection_id
    AND c.credential_ref = e.credential_ref AND c.enabled = 1
   WHERE e.tenant_id = ? AND e.connection_id = ? AND e.credential_ref = ?
     AND e.active = 1 LIMIT 1`;
