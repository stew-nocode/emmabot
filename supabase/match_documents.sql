-- Fonction RAG : recherche vectorielle sur public.documents.
-- Paramètre filter (jsonb) : contrainte metadata avec @> (toutes les paires clé/valeur).
-- Les clés dont la valeur est vide, null ou chaîne blanche sont ignorées → recherche élargie.
-- Idempotent : CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector,
  match_count integer DEFAULT 5,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  eff jsonb := '{}'::jsonb;
BEGIN
  IF filter IS NOT NULL AND filter <> '{}'::jsonb THEN
    SELECT coalesce(
      (
        SELECT jsonb_object_agg(e.key, e.value)
        FROM jsonb_each(filter) AS e
        WHERE jsonb_typeof(e.value) <> 'null'::text
          AND e.value <> 'null'::jsonb
          AND (
            jsonb_typeof(e.value) <> 'string'::text
            OR length(trim(e.value #>> '{}')) > 0
          )
      ),
      '{}'::jsonb
    )
    INTO eff;
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    (1 - (d.embedding <=> query_embedding))::double precision AS similarity
  FROM public.documents d
  WHERE
    filter IS NULL
    OR eff = '{}'::jsonb
    OR d.metadata @> eff
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;
