-- Colonne "enrichi" sur public.chatbot_logs (projet KB mkownbeynegpbawbysgl).
-- Appliquée le 2026-06-01 via Supabase (migration: add_enrichi_to_chatbot_logs).
-- Sert au badge "Déjà enrichie" du dashboard Knowledge IA (anti-doublon) :
--   detection A = match par thematique (cote app)
--   detection B = ce flag, pose a true quand une fiche KB est creee depuis la question.
-- Idempotent.

alter table public.chatbot_logs
  add column if not exists enrichi boolean not null default false;

comment on column public.chatbot_logs.enrichi is
  'true si une fiche KB a ete creee depuis cette question via le dashboard (flag B). Combine cote app avec un match par thematique (A).';
