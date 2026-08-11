-- Daily call counter for the Anthropic proxy (ARCHITECTURE_REVIEW_2026-07.md → R2).
-- One row per UTC day; the Worker upserts it on every proxied call and returns 429 once
-- `calls` passes DAILY_CALL_CAP. Rows are tiny and self-limiting (365/year), so there is
-- no cleanup job — delete old rows by hand if it ever matters.
CREATE TABLE IF NOT EXISTS api_usage (
  day   TEXT    PRIMARY KEY,        -- UTC date, YYYY-MM-DD
  calls INTEGER NOT NULL DEFAULT 0  -- proxied calls received that day (429s included)
);
