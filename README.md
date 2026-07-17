# Postline Social

Plataforma de gestão de redes sociais construída com Next.js, React, PostgreSQL e Drizzle ORM.

## Recursos

- Autenticação e workspaces
- Calendário e editor de publicações
- Gestão de clientes, equipe e biblioteca de mídia
- Caixa de entrada unificada
- Analytics e relatórios
- Geração de roteiros e criativos com OpenAI
- Pesquisa de tendências, músicas e concorrentes com fontes atuais
- Automação de directs do Instagram via webhook da Meta
- API com persistência PostgreSQL

## Desenvolvimento

1. Instale as dependências com `pnpm install`.
2. Copie `.env.example` para `.env.local` e configure `DATABASE_URL`.
3. Execute `pnpm db:migrate` para criar o schema.
4. Opcionalmente execute `pnpm db:seed` para carregar os dados demonstrativos.
5. Inicie com `pnpm dev`.

Credenciais do seed demonstrativo: `demo@postline.app` / `demo1234`.

## Integrações de produção

Configure `OPENAI_API_KEY` para ativar roteiros, criativos e pesquisas. Os modelos podem ser sobrescritos com `OPENAI_TEXT_MODEL` e `OPENAI_IMAGE_MODEL`.

Para directs do Instagram, configure as variáveis `META_ACCESS_TOKEN`, `META_IG_USER_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` e `META_WORKSPACE_ID`. Cadastre como webhook da Meta:

```text
https://seu-dominio.com/api/meta/webhook
```

## Validação

```bash
pnpm typecheck
pnpm lint
pnpm build
```
