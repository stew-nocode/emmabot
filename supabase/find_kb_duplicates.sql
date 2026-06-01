-- Détection de doublons KB (projet KB mkownbeynegpbawbysgl).
-- Appliquée le 2026-06-01 (migration: add_find_kb_duplicates_function).
-- Compare les fiches via la distance cosinus de leurs embeddings (déjà dans documents).
-- Gère le metadata double-encodé via (metadata #>> '{}')::jsonb.
-- Utilisée par le bouton "Détecter les doublons" du dashboard (seuil 0.93). Idempotent.

create or replace function public.find_kb_duplicates(min_similarity double precision default 0.93)
returns table (
  similarity double precision,
  thematique_a text, module_a text, id_assist_a text,
  thematique_b text, module_b text, id_assist_b text
)
language sql stable as $function$
  select
    (1 - (a.embedding <=> b.embedding))::double precision,
    ((a.metadata #>> '{}')::jsonb) ->> 'thematique', ((a.metadata #>> '{}')::jsonb) ->> 'module', a.id_assist::text,
    ((b.metadata #>> '{}')::jsonb) ->> 'thematique', ((b.metadata #>> '{}')::jsonb) ->> 'module', b.id_assist::text
  from public.documents a
  join public.documents b on a.id < b.id
  where a.embedding is not null and b.embedding is not null
    and (1 - (a.embedding <=> b.embedding)) >= min_similarity
  order by 1 desc
  limit 200;
$function$;
