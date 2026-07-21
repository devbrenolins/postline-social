# Guia de configuração — Postline

Este guia leva o Postline de "código pronto" a "100% funcional". Você só precisa
criar as contas externas, colar as chaves no `.env.local` e rodar as migrations.

Ordem recomendada: **1) Supabase → 2) rodar app → 3) OpenAI → 4) Instagram → 5) Cron**.

---

## 0. Preparação

```bash
cp .env.example .env.local
pnpm install
```

Preencha o `.env.local` conforme cada seção abaixo.

---

## 1. Supabase (banco de dados + autenticação)

1. Crie um projeto em <https://supabase.com/dashboard>.
2. **Project Settings → API**, copie para o `.env.local`:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` (secreta!) → `SUPABASE_SERVICE_ROLE_KEY`
3. **Project Settings → Database → Connection string → "URI"** (use a porta **6543**,
   pooler, com `?sslmode=require`) → `DATABASE_URL`.
4. Rode as migrations (cria todas as tabelas):

   ```bash
   pnpm db:migrate
   ```

### Login por e-mail
- **Authentication → Providers → Email**: já vem ligado.
- Por padrão o Supabase **exige confirmação de e-mail**. Para testar rápido, você
  pode desligar em **Authentication → Providers → Email → "Confirm email"**.
  Em produção, deixe ligado.

### Login com Google
1. Crie credenciais OAuth no [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (tipo "Web application").
2. Em **Authorized redirect URIs**, cole a URL que o Supabase mostra em
   **Authentication → Providers → Google** (algo como
   `https://<seu-projeto>.supabase.co/auth/v1/callback`).
3. Cole `Client ID` e `Client secret` no provider Google do Supabase e **ative**.
4. Em **Authentication → URL Configuration**, adicione seu domínio e
   `http://localhost:3000` em **Redirect URLs** (para o callback `/auth/callback`).

> O app já cria o perfil, o workspace inicial e vincula convites pendentes no
> primeiro login — nada manual.

---

## 2. Rodar o app

```bash
pnpm dev
```

Acesse <http://localhost:3000> → você é levado ao login. Crie uma conta por e-mail
ou entre com Google. Ao entrar, um workspace é criado automaticamente.

**Convidar pessoas:** menu **Equipe → Convidar**. A pessoa recebe um e-mail (se o
`service_role` e SMTP do Supabase estiverem configurados) e, ao entrar com aquele
e-mail, é automaticamente vinculada ao workspace com o papel definido.

**Criar outro workspace:** no seletor de workspace (topo da barra lateral) →
"Criar novo workspace".

---

## 3. OpenAI (roteiros e criativos)

1. Gere uma chave em <https://platform.openai.com/api-keys>.
2. `.env.local`:
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_TEXT_MODEL=gpt-4o        # opcional
   OPENAI_IMAGE_MODEL=gpt-image-1  # opcional
   ```
3. Pronto — a aba **IA & Automação** passa a gerar texto e imagens de verdade.

---

## 4. Instagram oficial (múltiplas contas Business)

> Requer um app na Meta e, para uso público, **App Review** aprovando as
> permissões. Em modo de desenvolvimento funciona com contas de teste que você
> mesmo adiciona ao app.

1. Crie um app em <https://developers.facebook.com/apps> (tipo "Business").
2. Adicione os produtos **Instagram** e **Facebook Login for Business**.
3. Em **App Settings → Basic**, copie:
   - `App ID` → `META_APP_ID`
   - `App Secret` → `META_APP_SECRET`
4. Defina um `META_VERIFY_TOKEN` (qualquer string secreta sua) no `.env.local`.
5. Em **Facebook Login → Settings → Valid OAuth Redirect URIs**, adicione:
   ```
   https://SEU_DOMINIO/api/meta/connect/callback
   http://localhost:3000/api/meta/connect/callback
   ```
6. Permissões a solicitar no App Review (Advanced Access):
   `instagram_basic`, `instagram_manage_insights`, `instagram_manage_messages`,
   `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`,
   `business_management`.
7. **Webhook** (para directs automáticos e inbox): em **Instagram → Webhooks**,
   assine o objeto e aponte para:
   ```
   Callback URL:  https://SEU_DOMINIO/api/meta/webhook
   Verify Token:  <o mesmo META_VERIFY_TOKEN>
   ```

### Como conectar contas no app
- A conta Instagram precisa ser **Business/Creator** e estar **vinculada a uma
  Página do Facebook**.
- No app: **Clientes → Conectar Instagram**. Você faz login na Meta, escolhe as
  Páginas e todas as contas IG vinculadas são importadas (pode repetir para vários
  perfis / várias contas).

### O que passa a funcionar
- **Métricas**: botão de sincronizar (`POST /api/accounts` action `sync`) puxa
  seguidores/reach e grava em `analytics_daily`.
- **Directs**: `POST /api/accounts` action `dm`, e respostas automáticas por
  palavra-chave via webhook (aba IA & Automação).
- **Publicar**: `POST /api/posts/{id}/publish` publica nas contas IG do cliente do
  post (imagem ou reel). As mídias devem ser **URLs públicas**.
- **Agendar**: crie o post com status `scheduled` e `scheduledAt`. O worker publica
  na hora (veja Cron).

---

## 5. Publicação agendada (Cron)

1. Defina `CRON_SECRET` (uma string secreta) no `.env.local` e nas env vars da Vercel.
2. O `vercel.json` já registra o cron `*/5 * * * *` chamando `/api/cron/publish`.
   A Vercel injeta `Authorization: Bearer $CRON_SECRET` automaticamente.
3. Fora da Vercel, agende um `curl` você mesmo:
   ```bash
   curl -X POST https://SEU_DOMINIO/api/cron/publish \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

---

## 6. Deploy (Vercel)

1. Importe o repositório na Vercel.
2. Cole **todas** as variáveis do `.env.local` em **Settings → Environment Variables**.
3. Defina `NEXT_PUBLIC_APP_URL` com o domínio final (ex.: `https://postline.app`).
4. Atualize os redirect URIs do Google (Supabase) e da Meta com o domínio final.

---

## Validação

```bash
pnpm typecheck   # ou: ./node_modules/.bin/tsc --noEmit
pnpm lint
pnpm build
```

## PWA

O app é instalável (manifest + service worker). Os ícones em `public/icons/` foram
gerados a partir da logo (`public/postline-logo.svg`). Para trocar a logo, substitua
o SVG e regenere os ícones a partir dele.
