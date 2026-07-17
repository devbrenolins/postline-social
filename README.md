# Postline Social

Plataforma de gestão de redes sociais construída com Next.js, React, PostgreSQL e Drizzle ORM.

## Recursos

- Autenticação e workspaces
- Calendário e editor de publicações
- Gestão de clientes, equipe e biblioteca de mídia
- Caixa de entrada unificada
- Analytics e relatórios
- API com persistência PostgreSQL

## Desenvolvimento

1. Instale as dependências com `pnpm install`.
2. Copie `.env.example` para `.env.local` e configure `DATABASE_URL`.
3. Execute `pnpm db:migrate` para criar o schema.
4. Opcionalmente execute `pnpm db:seed` para carregar os dados demonstrativos.
5. Inicie com `pnpm dev`.

Credenciais do seed demonstrativo: `demo@postline.app` / `demo1234`.

## Validação

```bash
pnpm typecheck
pnpm lint
pnpm build
```
