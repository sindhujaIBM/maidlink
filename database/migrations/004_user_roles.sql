-- A single user account can hold multiple roles simultaneously.
-- Default role CUSTOMER is always added on first login.
CREATE TABLE user_roles (
  user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       user_role NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
