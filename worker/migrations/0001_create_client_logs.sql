-- Persistent storage for client-side ERROR logs shipped to POST /api/log.
CREATE TABLE IF NOT EXISTS client_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   INTEGER NOT NULL,   -- client-side Date.now() (ms) when the event happened
  received_at INTEGER NOT NULL,   -- server-side receipt time (ms)
  level       TEXT    NOT NULL,
  module      TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  data        TEXT,               -- JSON-encoded structured payload (nullable)
  user_agent  TEXT,
  url         TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_logs_received_at ON client_logs(received_at);
CREATE INDEX IF NOT EXISTS idx_client_logs_level       ON client_logs(level);
CREATE INDEX IF NOT EXISTS idx_client_logs_module      ON client_logs(module);
