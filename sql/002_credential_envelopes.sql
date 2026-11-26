-- MariaDB 10.11+. REVIEW ONLY; run after 001 in a dedicated MCP database.
-- Envelope metadata only: no plaintext token, KEK or unwrapped data key.
-- Every entry remains disabled until separately audited provisioning succeeds.
CREATE TABLE IF NOT EXISTS mcp_credential_envelopes (
  tenant_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  connection_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  credential_ref VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version TINYINT UNSIGNED NOT NULL DEFAULT 1,
  key_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  wrapped_key TEXT CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nonce VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  ciphertext TEXT CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tag VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, connection_id, credential_ref),
  CONSTRAINT fk_mcp_envelope_connection FOREIGN KEY (tenant_id, connection_id)
    REFERENCES mcp_connections(tenant_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;
