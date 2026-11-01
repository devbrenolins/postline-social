-- Defesa em profundidade: liga RLS em todas as tabelas, SEM políticas.
--
-- O Supabase expõe o schema `public` via PostgREST com a anon key (que é
-- pública, vai no bundle do navegador). Sem RLS, qualquer pessoa leria e
-- escreveria nestas tabelas direto pela API REST, ignorando o app.
--
-- Com RLS ligado e nenhuma política, anon/authenticated não enxergam nada. O app
-- continua funcionando porque conecta via DATABASE_URL como o papel `postgres`
-- (BYPASSRLS), e o Storage/Auth usam as próprias chaves. Se um dia o app passar
-- a falar com estas tabelas pelo supabase-js, será preciso criar políticas.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_breakdowns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhooks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "direct_automations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "competitors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_generations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_ledger" ENABLE ROW LEVEL SECURITY;
