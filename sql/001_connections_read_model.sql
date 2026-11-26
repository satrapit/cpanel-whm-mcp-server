-- MariaDB 10.11+ (utf8mb4_bin). Run only in a dedicated MCP application database.
-- Schema only; no real credentials, users or grants are inserted by this migration.
-- Apply with a database administrator after reviewing the backup/rollback plan.
CREATE TABLE IF NOT EXISTS mcp_tenants (
  id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mcp_tenant_memberships (
  tenant_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  subject VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, subject),
  CONSTRAINT fk_mcp_member_tenant FOREIGN KEY (tenant_id) REFERENCES mcp_tenants(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mcp_connections (
  tenant_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind ENUM('cpanel', 'whm') NOT NULL,
  hostname VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  username VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  credential_ref VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT fk_mcp_conn_tenant FOREIGN KEY (tenant_id) REFERENCES mcp_tenants(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mcp_connection_capabilities (
  tenant_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  connection_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  capability ENUM('cpanel.domains.list', 'whm.accounts.list') NOT NULL,
  verified TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, connection_id, capability),
  CONSTRAINT fk_mcp_cap_conn FOREIGN KEY (tenant_id, connection_id)
    REFERENCES mcp_connections(tenant_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mcp_connection_grants (
  tenant_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  connection_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  subject VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, connection_id, subject),
  KEY ix_mcp_grants_subject (tenant_id, subject),
  CONSTRAINT fk_mcp_grant_connection FOREIGN KEY (tenant_id, connection_id)
    REFERENCES mcp_connections(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_mcp_grant_membership FOREIGN KEY (tenant_id, subject)
    REFERENCES mcp_tenant_memberships(tenant_id, subject) ON DELETE CASCADE
) ENGINE=InnoDB;
