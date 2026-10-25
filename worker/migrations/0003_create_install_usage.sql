-- Per-installation usage for the Anthropic proxy (W-2, docs/native/identitet-w2.md).
-- One row per identity per UTC day. The Worker reads today's row before proxying (429
-- install_cap_reached once INSTALL_DAILY_CALL_CAP / INSTALL_DAILY_TOKEN_CAP is passed) and
-- upserts it after a successful answer with the `usage` block from Anthropic.
-- The identity is pseudonymous but counts as personal data once tied to a tester: rows
-- older than 90 days should be deleted by hand (no automatic cleanup — see the doc).
CREATE TABLE IF NOT EXISTS install_usage (
  install_id         TEXT    NOT NULL,           -- UUID v4 from X-SwingCheck-Install, or 'anon'
  day                TEXT    NOT NULL,           -- UTC date, YYYY-MM-DD
  calls              INTEGER NOT NULL DEFAULT 0, -- successfully proxied calls (429s and upstream errors excluded)
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (install_id, day)
);
