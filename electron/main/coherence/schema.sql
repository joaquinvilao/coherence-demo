-- Coherence Engine Demo — SQLite schema
-- Simple version for demo: no Kuzu, no Graphiti
-- Bi-temporal fields kept for timeline scrubber (valid_at / invalid_at)

CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  filepath    TEXT NOT NULL,
  title       TEXT,
  content_hash TEXT,                          -- SHA-256 para evitar re-procesar
  ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS claims (
  id              TEXT PRIMARY KEY,
  document_id     TEXT REFERENCES documents(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  predicate       TEXT NOT NULL,
  object          TEXT NOT NULL,
  confidence      REAL DEFAULT 1.0,
  valid_at        DATETIME,                   -- cuándo empezó a ser verdad en el mundo
  invalid_at      DATETIME,                   -- NULL = sigue vigente
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  raw_text        TEXT                        -- fragmento original del que se extrajo
);

CREATE TABLE IF NOT EXISTS relations (
  id          TEXT PRIMARY KEY,
  claim_a_id  TEXT REFERENCES claims(id) ON DELETE CASCADE,
  claim_b_id  TEXT REFERENCES claims(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL CHECK(relation IN ('contradiction','entailment','neutral')),
  explanation TEXT,
  confidence  REAL DEFAULT 1.0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices para el timeline scrubber (queries por fecha frecuentes)
CREATE INDEX IF NOT EXISTS idx_claims_valid_at   ON claims(valid_at);
CREATE INDEX IF NOT EXISTS idx_claims_invalid_at ON claims(invalid_at);
CREATE INDEX IF NOT EXISTS idx_claims_document   ON claims(document_id);
CREATE INDEX IF NOT EXISTS idx_relations_a       ON relations(claim_a_id);
CREATE INDEX IF NOT EXISTS idx_relations_b       ON relations(claim_b_id);
CREATE INDEX IF NOT EXISTS idx_relations_type    ON relations(relation);
