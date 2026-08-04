# Guia de configuração — Postline

Este guia leva o Postline de "código pronto" a "100% funcional". Você só precisa
criar as contas externas, colar as chaves no `.env.local` e rodar as migrations.

Ordem recomendada: **1) Supabase → 2) rodar app → 3) Gemini → 3b) Cloudflare → 4) Instagram → 5) Cron**.

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

## 3. Google Gemini (roteiros, criativos e pesquisa)

1. Gere uma chave **gratuita** em <https://aistudio.google.com/apikey>
   (basta uma conta Google; não precisa de cartão).
2. `.env.local`:
   ```
   GEMINI_API_KEY=AIza...
   GEMINI_TEXT_MODEL=gemini-3.5-flash        # opcional
   GEMINI_IMAGE_MODEL=gemini-2.5-flash-image # opcional
   ```
3. Confira o que a sua chave alcança:
   ```bash
   pnpm ai:check
   ```
4. Pronto — a aba **IA & Automação** passa a gerar texto e imagens de verdade.

**Modelos usados**

| Recurso | Modelo padrão | Fallback automático |
| --- | --- | --- |
| Roteiros, tendências, concorrentes | `gemini-2.5-flash` | `gemini-3.5-flash` → `gemini-3.6-flash` |

O `gemini-2.5-flash` vem primeiro porque é o único confirmado com cota gratuita
de **grounding (Google Search)** — os modelos 3.x geram texto normalmente, mas
devolvem 429 na busca em chaves free. Se um modelo responder 404/403/429, o app
tenta o próximo sozinho (cada modelo tem cota independente).

> **Imagem não vem do Gemini.** Todos os modelos de imagem do Google têm
> `limit: 0` no tier gratuito — não é cota esgotada, é ausência de cota. Por
> isso os criativos usam a Cloudflare (passo 3b). Se você ativar faturamento no
> Google depois, basta definir `IMAGE_PROVIDER=gemini`.

---

## 3b. Cloudflare Workers AI (criativos)

Conta gratuita, **10.000 neurons/dia**, sem cartão.

1. Crie uma conta em <https://dash.cloudflare.com>.
2. **Account ID**: abra *Workers & Pages* — o ID aparece na barra lateral direita.
3. **API Token**: *My Profile → API Tokens → Create Token* → use o template
   **Workers AI** (permissão `Workers AI: Read`).
4. `.env.local`:
   ```
   CLOUDFLARE_ACCOUNT_ID=...
   CLOUDFLARE_API_TOKEN=...
   ```
5. `pnpm ai:check` para confirmar.

**Modelos de imagem** (verificados com chamadas reais — `pnpm ai:check`)

| Ordem | Modelo | Observação |
| --- | --- | --- |
| 1º | `@cf/black-forest-labs/flux-2-klein-4b` | FLUX.2 — fotorrealismo, qualquer proporção. ~104 neurons no 1:1 e ~156 no 2:3 → 60 a 95 imagens/dia |
| 2º | `@cf/black-forest-labs/flux-1-schnell` | Bom, mas só gera quadrado |
| 3º | `@cf/bytedance/stable-diffusion-xl-lightning` | Último recurso. US$ 0,00/step, qualidade bem inferior |
| 4º | `@cf/stabilityai/stable-diffusion-xl-base-1.0` | Idem |

O modelo preferido ganha duas tentativas antes de o fallback entrar — uma falha
passageira da Cloudflare não deve rebaixar a qualidade do criativo. O limite do
próprio Postline (8 criativos/dia por workspace) já é bem menor que a cota.

**Prompt:** o briefing em português passa pelo Gemini antes, que o reescreve
como um prompt fotográfico em inglês (assunto, composição, lente, luz, paleta,
clima) — é o idioma em que os modelos de difusão foram treinados, e a diferença
de qualidade é grande. Se o Gemini estiver fora do ar ou sem cota, o briefing
original segue direto.

**Texto na peça:** modelo de difusão não escreve texto confiável — em português
erra letra na maioria das gerações. Então a IA gera só a FOTO, com espaço
negativo reservado, e o app desenha a copy por cima em vetor (`src/lib/creative.ts`,
fonte Inter empacotada em `fonts/`). Sai exatamente o texto pedido, na cor exata.

O layout **não é template fixo**: a cada geração o Gemini devolve, num único
JSON, o prompt da foto, a copy em português, a paleta e o layout (zona do texto,
alinhamento e tipo de véu) escolhidos para aquele briefing. Se você preencher o
campo de texto, ele é usado literalmente; se deixar vazio, a IA escreve. A cor
da marca, quando informada, ancora a paleta. O switch **Compor texto na peça**
desliga tudo isso e devolve só a foto.

**Imagens de referência:** nenhum modelo gratuito da Cloudflare faz img2img de
verdade — o `image_b64` do SDXL responde `input tensor 'image' is not present`
e o FLUX.2 aceita o campo `image` mas ignora o conteúdo (testado com uma
referência de cores berrantes: nenhuma apareceu no resultado). Em vez disso, as
referências vão para a **visão do Gemini**, que absorve a direção de arte
(paleta, luz, enquadramento, clima) no prompt. Segue a influência sem copiar
marcas, e sem perder resolução nem liberdade de formato.

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
