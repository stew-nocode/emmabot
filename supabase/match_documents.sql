-- Fonction RAG : recherche vectorielle sur public.documents.
-- Amélioration : le paramètre filter (jsonb) est appliqué quand il n’est pas vide.
-- Ex. filter = '{"module":"RH"}'::jsonb → metadata doit contenir au moins ces clés/valeurs.
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
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    (1 - (d.embedding <=> query_embedding))::double precision AS similarity
  FROM public.documents d
  WHERE
    filter IS NULL
    OR filter = '{}'::jsonb
    OR d.metadata @> filter
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;
