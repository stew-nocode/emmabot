-- Optionnel : accélère les filtres metadata @> sur documents (à lancer hors charge si la table est grande).
-- Idempotent.

CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_metadata_gin
  ON public.documents
  USING gin (metadata jsonb_path_ops);
