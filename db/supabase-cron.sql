-- ============================================================================
--  Agendador de publicação via Supabase (pg_cron + pg_net)
--  Substitui o Vercel Cron (que no plano Hobby só roda 1x/dia).
--
--  O banco NÃO publica no Instagram — ele só dispara um POST no endpoint
--  /api/cron/publish do app a cada 5 min; a publicação em si roda no app.
--
--  Como usar: Supabase → SQL Editor → cole e rode este script.
--  Troque a URL pelo domínio do seu deploy e mantenha o mesmo CRON_SECRET
--  que está em .env.local / nas variáveis da Vercel.
-- ============================================================================

-- 1. Extensões (idempotente)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. (Re)agenda o job. unschedule evita erro se já existir.
select cron.unschedule('postline-publish')
where exists (select 1 from cron.job where jobname = 'postline-publish');

select cron.schedule(
  'postline-publish',
  '*/5 * * * *',                       -- a cada 5 minutos (UTC)
  $$
  select net.http_post(
    url     := 'https://SEU-APP.vercel.app/api/cron/publish',
    headers := jsonb_build_object(
      'Authorization', 'Bearer 1oR9un0gpAENW0xCdO1cOInP0Du0bZeO',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------------------------
--  Comandos úteis
-- ----------------------------------------------------------------------------
-- Ver o job agendado:
--   select * from cron.job;
-- Ver as últimas execuções (status/erros):
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Remover o job:
--   select cron.unschedule('postline-publish');
