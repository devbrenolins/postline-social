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

## 3b. Provedor de criativos

Duas opções, e o app escolhe sozinho: se houver `OPENAI_API_KEY`, usa a OpenAI;
senão, a Cloudflare. Dá para forçar com `IMAGE_PROVIDER=openai|cloudflare|gemini`.

| | OpenAI | Cloudflare Workers AI |
| --- | --- | --- |
| Custo | **pago**, ~US$ 0,02 a 0,20 por imagem | gratuito, 10.000 neurons/dia |
| Texto na arte | desenhado pelo próprio modelo | composto em vetor pelo app |
| Imagens de referência | edição real (até 16) | viram descrição de texto |
| Cartão | exigido | não |

### Opção A — OpenAI (recomendada para criativo pronto)

1. Chave em <https://platform.openai.com/api-keys>.
2. `.env.local`:
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_IMAGE_MODEL=gpt-image-2   # opcional
   OPENAI_IMAGE_QUALITY=high        # opcional: low | medium | high
   ```
3. `pnpm ai:check` para confirmar.

Modelos, em ordem de tentativa: `gpt-image-2` → `gpt-image-1.5` → `gpt-image-1`.
O `quality` é o que mais mexe no custo e na nitidez do texto — `high` é o padrão
porque tipografia borrada estraga a peça.

> Se a chave der 403, a organização provavelmente precisa de verificação de
> identidade no painel da OpenAI para liberar os modelos de imagem.

### Opção B — Cloudflare Workers AI (gratuita)

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

**Modelos de imagem** (verificados com chamadas reais)

| Ordem | Modelo | Observação |
| --- | --- | --- |
| 1º | `@cf/black-forest-labs/flux-2-klein-4b` | FLUX.2 — fotorrealismo, qualquer proporção. ~104 neurons no 1:1 e ~156 no 2:3 → 60 a 95 imagens/dia |
| 2º | `@cf/black-forest-labs/flux-1-schnell` | Bom, mas só gera quadrado |
| 3º | `@cf/bytedance/stable-diffusion-xl-lightning` | Último recurso. US$ 0,00/step, qualidade bem inferior |
| 4º | `@cf/stabilityai/stable-diffusion-xl-base-1.0` | Idem |

O modelo preferido ganha duas tentativas antes de o fallback entrar. O limite do
próprio Postline (8 criativos/dia por workspace) já é bem menor que a cota.

### Como o texto entra na peça

Em ambos os casos o Gemini monta a direção de arte num JSON só — prompt da foto,
copy em português, paleta e layout —, e o layout **varia a cada briefing**. O que
muda é quem desenha a tipografia:

- **OpenAI**: a copy é citada literalmente dentro do prompt e o modelo desenha o
  texto na arte, com controle de posição, peso e cor.
- **Cloudflare**: o prompt reserva espaço negativo, a foto sai sem texto e o app
  desenha a copy por cima em vetor (`src/lib/creative.ts`, fonte Inter em
  `fonts/`). É o caminho para quando não se quer pagar por imagem — modelo de
  difusão gratuito erra letra em português na maioria das gerações.

Se você preencher o campo de texto no Studio, ele é usado literalmente; vazio, a
IA escreve. A cor da marca, quando informada, ancora a paleta. O switch **Texto
na peça** desliga tudo isso e devolve só a foto.

**Imagens de referência:** na OpenAI vão como edição real (`/images/edits`). Na
Cloudflare nenhum modelo gratuito faz img2img — o `image_b64` do SDXL responde
`input tensor 'image' is not present` e o FLUX.2 aceita o campo `image` mas
ignora o conteúdo —, então elas passam pela visão do Gemini e viram direção de
arte em texto.

---

## 4. Instagram oficial (Instagram API with Instagram Login)

> O usuário conecta a conta **logando direto no Instagram** — sem Página do
> Facebook. Todas as chamadas usam `graph.instagram.com`.
>
> Em modo de desenvolvimento funciona com contas que você adiciona como
> testadoras no app. Para uso público, precisa de **App Review**.

1. Crie um app em <https://developers.facebook.com/apps>.
2. Adicione o produto **Instagram** → **API setup with Instagram login**.
3. Em **Instagram → Configuração da API**, copie:
   - `Instagram App ID` → `INSTAGRAM_APP_ID`
   - `Instagram App Secret` → `INSTAGRAM_APP_SECRET`

   > Atenção: são diferentes do App ID/Secret do Facebook em *Configurações
   > básicas*. O ID de Instagram **não existe** em `graph.facebook.com` — usar o
   > par errado faz toda chamada falhar com "Cannot parse access token".

4. Defina um `META_VERIFY_TOKEN` (qualquer string secreta sua) no `.env.local`.
5. Em **Instagram → Configuração da API → URIs de redirecionamento OAuth**:
   ```
   https://SEU_DOMINIO/api/meta/connect/callback
   http://localhost:3000/api/meta/connect/callback
   ```
6. Permissões pedidas no OAuth (constante `META_SCOPES` em `src/lib/instagram.ts`):
   `instagram_business_basic`, `instagram_business_manage_insights`,
   `instagram_business_manage_messages`, `instagram_business_manage_comments`,
   `instagram_business_content_publish`.

   São essas — e só essas — que devem ir para o **App Review** pedindo Advanced
   Access. As antigas (`instagram_basic`, `pages_show_list`, …) pertencem ao
   caminho via Facebook Login, que este app não usa.

7. **Webhook** (inbox e automações de direct): em **Instagram → Webhooks**,
   aponte para:
   ```
   Callback URL:  https://SEU_DOMINIO/api/meta/webhook
   Verify Token:  <o mesmo META_VERIFY_TOKEN>
   ```
   Assine os campos `comments` e `messages`.

   > **O app precisa estar publicado (Live) para receber webhook.** Em modo de
   > desenvolvimento a Meta não entrega evento nenhum, mesmo com a URL correta e
   > a conta inscrita.

8. Na conta Instagram, ligue **Configurações → Privacidade das mensagens →
   Ferramentas conectadas → Permitir acesso às mensagens**. Sem isso a API
   devolve conversas vazias, sem erro.

### Níveis de acesso e CNPJ

- **Standard Access** (padrão): o app só enxerga dados de contas com papel nele
  (Instagram Tester, e a conta precisa aceitar o convite). Serve para desenvolver
  e testar. Não pede documento.
- **Advanced Access**: necessário para clientes conectarem as contas deles. Exige
  App Review e, na prática, **verificação do negócio** — no Brasil, CNPJ (MEI
  serve). Confirme os documentos exigidos em **Configurações do negócio →
  Segurança → Verificação do negócio**, que a regra muda.

### Como conectar contas no app
- A conta precisa ser **Business ou Creator** (perfil pessoal não funciona).
- No app: **Clientes → Conectar Instagram** (ou em **Configurações → Contas**).
  O login acontece em instagram.com e traz a conta daquele login — repita para
  conectar outros perfis.
- O callback guarda **dois** identificadores da conta: `external_id` (ID da conta
  profissional) e `app_scoped_id` (o "ID do usuário" que aparece no app do
  Instagram). São números diferentes e a Meta usa um ou outro conforme o evento;
  o webhook casa por qualquer um dos dois.

### O que passa a funcionar

- **Métricas** (`GET /api/analytics`, que sincroniza sozinho ao abrir Análises):
  alcance, visualizações, engajamento, visitas ao perfil e cliques no site por
  dia em `analytics_daily`; recortes de seguidor vs. não seguidor e por tipo de
  mídia (incluindo anúncios) em `analytics_breakdowns`; demografia da audiência.
  Faz backfill de 30 dias com orçamento de chamadas — se não couber numa
  requisição, a próxima abertura continua de onde parou.
- **Publicar** (`POST /api/posts/{id}/publish`): respeita o formato do composer —
  feed, **carrossel** (2 a 10 mídias), **stories** (uma publicação por mídia) e
  reels. Aceita colaboradores, local, texto alternativo e capa do reel. As mídias
  precisam ser **URLs públicas** (http/https); data URI não funciona.
- **Agendar**: crie o post com status `scheduled` e `scheduledAt` (veja Cron).
- **Inbox**: comentários e directs chegam por webhook; o botão *Buscar no
  Instagram* importa o histórico anterior à conexão. Responder envia de verdade
  (resposta pública no comentário, direct na mensagem), e dá para ocultar ou
  apagar comentário.
- **Feed do Instagram**: publicações reais com alcance, views, retenção de reels,
  stories no ar, marcações e cota de publicação das últimas 24h.
- **Directs avulsos e automações**: `POST /api/accounts` com `action: "dm"`, e
  respostas por palavra-chave via webhook (aba IA & Automação).
- **Sincronizar na mão**: `POST /api/accounts` com `action: "sync"` força a
  atualização das métricas ignorando o TTL.

---

## 4b. X (Twitter) — só o que é gratuito

> O plano gratuito da API do X publica, mas não lê métrica. A integração aqui
> cobre exatamente isso — nada que exija plano pago foi implementado.

**O que funciona**
- Conectar a conta por OAuth 2.0 (PKCE)
- Handle, nome, avatar e **contagem de seguidores**
- Publicar texto, com até 4 mídias
- **Thread automática**: texto acima de 280 caracteres é quebrado e publicado
  encadeado, com marcador `(1/3)`

**O que não existe e por quê**
- Métricas por post, busca, timeline e menções: exigem plano pago (Basic ~US$200/mês)
- Por isso o X não aparece nos gráficos de Análises — só na contagem de seguidores

### Configuração

1. Crie um projeto e um app em <https://developer.x.com>.
2. Em **User authentication settings**:
   - Tipo: **Web App, Automated App or Bot** (client confidencial)
   - Permissões: **Read and write**
   - Callback URI: `https://SEU_DOMINIO/api/x/connect/callback`
   - Website URL: o domínio do app
3. Copie **OAuth 2.0 Client ID e Client Secret** para `X_CLIENT_ID` e
   `X_CLIENT_SECRET`. (Não são a API Key/Secret do OAuth 1.0a.)
4. Escopos pedidos: `tweet.read`, `tweet.write`, `users.read`, `media.write`,
   `offline.access`.

   > `offline.access` é obrigatório: o access token do X dura ~2h. Sem o refresh
   > token a conta se desconectaria sozinha entre um agendamento e a publicação.

### Cota mensal

O limite gratuito é por **app**, somando todos os workspaces, e a API não expõe o
consumo. O Postline conta as publicações do mês e recusa antes de estourar —
ajuste em `X_MONTHLY_POST_LIMIT` (padrão 450). A contagem é conservadora: uma
thread gasta uma unidade por tweet, mas é contada como um post.

### Envio de mídia

É a parte mais frágil do plano gratuito. Se o upload falhar, o post sai **só com
o texto** e o resultado avisa — melhor que perder a publicação inteira.

---

## 5. Publicação agendada (Cron)

1. Defina `CRON_SECRET` (uma string secreta) no `.env.local` e nas env vars da Vercel.
2. Registre o cron na Vercel apontando para `/api/cron/publish` — em
   **Settings → Cron Jobs** ou adicionando `crons` ao `vercel.json`. O
   `vercel.json` do repositório **não** define nenhum cron hoje, então sem esse
   passo os posts agendados não saem sozinhos. A Vercel injeta o
   `Authorization: Bearer $CRON_SECRET` automaticamente.
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
5. Confira que `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` estão definidos — as
   `META_APP_ID`/`META_APP_SECRET` são só fallback legado e não servem para o
   fluxo de Instagram Login.

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
