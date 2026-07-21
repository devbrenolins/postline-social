# Postline Social

Plataforma de gestão de redes sociais construída com Next.js, React, PostgreSQL e Drizzle ORM.

## Recursos

- **Autenticação via Supabase** (e-mail + Google) com provisionamento automático de perfil e workspace
- **Workspaces e equipe**: crie espaços de trabalho e convide pessoas por e-mail (vínculo automático no primeiro login)
- **Instagram oficial (Graph API)**: conecte várias contas Business, sincronize métricas, envie directs e publique/agende posts
- Calendário e editor de publicações
- Gestão de clientes e biblioteca de mídia
- Caixa de entrada unificada (mensagens do webhook da Meta)
- Analytics e relatórios
- Geração de roteiros e criativos com OpenAI
- **PWA** instalável (manifest + service worker)
- API com persistência PostgreSQL (Drizzle ORM)

## Configuração

O passo a passo completo (Supabase, OpenAI, Instagram/Meta, Cron e deploy) está em
**[SETUP.md](./SETUP.md)**.

Resumo:

1. `cp .env.example .env.local` e `pnpm install`.
2. Preencha as chaves do Supabase (banco + auth) e rode `pnpm db:migrate`.
3. `pnpm dev` e acesse <http://localhost:3000>.
4. Adicione `OPENAI_API_KEY` e as credenciais da Meta conforme o SETUP.

> Autenticação, banco e RLS são fornecidos pelo Supabase — o `DATABASE_URL` aponta
> para o Postgres do próprio projeto Supabase.

## Validação

```bash
pnpm typecheck
pnpm lint
pnpm build
```
