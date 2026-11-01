-- ============================================================================
--  Agendadores via Supabase (pg_cron + pg_net)
--  Substituem o Vercel Cron (que no plano Hobby só roda 1x/dia e limita a
--  quantidade de jobs — o deploy é rejeitado se passar).
--
--  O banco não faz o trabalho: ele só dispara POSTs nos endpoints do app.
--    1. /api/cron/publish    a cada minuto — publica os posts agendados
--    2. /api/cron/lifecycle  de hora em hora — avisa sobre fim de teste e
--       token do Instagram vencendo
--
--  Como usar: Supabase → SQL Editor → cole e rode este script.
--  Troque a URL pelo domínio do seu deploy e mantenha o mesmo CRON_SECRET
--  que está em .env.local / nas variáveis da Vercel.
-- ============================================================================

--  ATENÇÃO: o CRON_SECRET NÃO fica neste arquivo (ele vai para o git). Antes de
--  rodar, defina-o no banco, uma única vez, na mesma sessão do SQL Editor:
--      alter database postgres set app.cron_secret = 'COLE_O_SEGREDO_AQUI';
--  e reconecte. O job lê o valor com current_setting().
--
-- 1. Extensões (idempotente)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. (Re)agenda o job. unschedule evita erro se já existir.
select cron.unschedule('postline-publish')
where exists (select 1 from cron.job where jobname = 'postline-publish');

select cron.schedule(
  'postline-publish',
  '* * * * *',                         -- a cada minuto (piso do pg_cron)
  $$
  select net.http_post(
    url     := 'https://postline-social.vercel.app/api/cron/publish',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 3. Avisos de ciclo de vida (fim de teste, token do Instagram vencendo).
--    De hora em hora basta: os avisos são deduplicados por `dedupe_key`, então
--    rodar de novo não reenvia nada — no pior caso o usuário é avisado até uma
--    hora depois do marco, o que é irrelevante para um teste de 7 dias.
select cron.unschedule('postline-lifecycle')
where exists (select 1 from cron.job where jobname = 'postline-lifecycle');

select cron.schedule(
  'postline-lifecycle',
  '7 * * * *',                         -- minuto 7 de cada hora (UTC)
  $$
  select net.http_post(
    url     := 'https://postline-social.vercel.app/api/cron/lifecycle',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------------------------
--  Comandos úteis
-- ----------------------------------------------------------------------------
-- Ver os jobs agendados:
--   select * from cron.job;
-- Ver as últimas execuções (status/erros):
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Remover um job:
--   select cron.unschedule('postline-publish');
--   select cron.unschedule('postline-lifecycle');
