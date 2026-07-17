import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { scryptSync, randomBytes } from "crypto";
import {
  users, workspaces, workspaceMembers, clients, socialAccounts, folders,
  media, posts, inboxItems, notifications, analyticsDaily, activityLogs, apiKeys, webhooks,
} from "../src/db/schema";
import type { Platform } from "../src/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

/* Deterministic RNG for reproducible metrics */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(min + rnd() * (max - min));

const IMG = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940`;

const DAYS = 75;
const iso = (d: Date) => d.toISOString();
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  console.log("Seeding Postline demo data…");
  await db.delete(users).where(eq(users.email, "demo@postline.app"));

  const [user] = await db.insert(users).values({
    email: "demo@postline.app",
    name: "Marina Duarte",
    passwordHash: hashPassword("demo1234"),
    avatarColor: "#AB2F5F",
  }).returning();

  const [ws] = await db.insert(workspaces).values({
    name: "Aurora Studio",
    slug: "aurora-studio",
    color: "#AB2F5F",
    plan: "pro",
    ownerId: user.id,
  }).returning();
  const wid = ws.id;

  await db.insert(workspaceMembers).values([
    { workspaceId: wid, userId: user.id, role: "admin", status: "active", avatarColor: "#AB2F5F" },
    { workspaceId: wid, invitedEmail: "rafael@aurora.studio", role: "editor", status: "active", avatarColor: "#3E6C8E" },
    { workspaceId: wid, invitedEmail: "luisa@aurora.studio", role: "designer", status: "active", avatarColor: "#6B5B95" },
    { workspaceId: wid, invitedEmail: "tomas@cafealma.com.br", role: "client", status: "pending", avatarColor: "#8A6D3B" },
  ]);

  const clientDefs = [
    { name: "Café Alma", industry: "Gastronomia", color: "#8A6D3B", responsible: "Tomás Ribeiro", notes: "Aprovação de conteúdo toda segunda-feira. Preferência por tons quentes e fotografia analógica. Evitar legendas muito longas no Instagram." },
    { name: "Velvet Skin", industry: "Beleza & Skincare", color: "#AB2F5F", responsible: "Helena Vaz", notes: "Lançamento da linha Botanic em abril. Foco em Reels 3x/semana e prova social com UGC." },
    { name: "Nómada Travel", industry: "Turismo", color: "#3E6C8E", responsible: "Diego Prates", notes: "Campanha de verão com 12 destinos. Roteiros de carrossel aprovados pelo cliente." },
    { name: "Atlas Fit", industry: "Fitness", color: "#3F7D5D", responsible: "Carla Nunes", notes: "Desafio 30 dias em andamento. Responder comentários em até 4h úteis." },
  ];
  const clientRows = await db.insert(clients).values(
    clientDefs.map((c) => ({ ...c, workspaceId: wid, status: "active" as const }))
  ).returning();
  const C = Object.fromEntries(clientRows.map((c) => [c.name, c]));

  const accountDefs: { client: string; platform: Platform; handle: string; displayName: string; followers: number }[] = [
    { client: "Café Alma", platform: "instagram", handle: "cafealma", displayName: "Café Alma", followers: 12480 },
    { client: "Café Alma", platform: "facebook", handle: "cafealma", displayName: "Café Alma", followers: 8930 },
    { client: "Velvet Skin", platform: "instagram", handle: "velvet.skin", displayName: "Velvet Skin", followers: 48210 },
    { client: "Velvet Skin", platform: "tiktok", handle: "velvetskin", displayName: "Velvet Skin", followers: 22140 },
    { client: "Nómada Travel", platform: "instagram", handle: "nomada.travel", displayName: "Nómada Travel", followers: 86930 },
    { client: "Nómada Travel", platform: "youtube", handle: "nomadatravel", displayName: "Nómada Travel", followers: 15320 },
    { client: "Atlas Fit", platform: "instagram", handle: "atlasfit", displayName: "Atlas Fit", followers: 32740 },
    { client: "Atlas Fit", platform: "x", handle: "atlasfit", displayName: "Atlas Fit", followers: 8410 },
    { client: "Atlas Fit", platform: "linkedin", handle: "atlas-fitness", displayName: "Atlas Fitness", followers: 3120 },
  ];
  const accountRows = await db.insert(socialAccounts).values(
    accountDefs.map((a) => ({
      workspaceId: wid, clientId: C[a.client].id, platform: a.platform,
      handle: a.handle, displayName: a.displayName, followers: a.followers,
    }))
  ).returning();

  /* ---------------------------------- Media ---------------------------------- */
  const folderDefs = [
    { name: "Campanhas", color: "#AB2F5F" },
    { name: "Produtos", color: "#8A6D3B" },
    { name: "Lifestyle", color: "#3E6C8E" },
    { name: "Viagens", color: "#3F7D5D" },
    { name: "Bastidores", color: "#6B5B95" },
  ];
  const folderRows = await db.insert(folders).values(folderDefs.map((f) => ({ ...f, workspaceId: wid }))).returning();
  const F = Object.fromEntries(folderRows.map((f) => [f.name, f]));

  const mediaDefs = [
    { id: 29765795, name: "flatlay-mesa-rosa-01.jpg", folder: "Lifestyle", tags: ["flatlay", "rosa", "desk"] },
    { id: 29765807, name: "flatlay-mesa-rosa-02.jpg", folder: "Lifestyle", tags: ["flatlay", "workspace"] },
    { id: 29765797, name: "camera-vintage-kodak.jpg", folder: "Bastidores", tags: ["câmera", "vintage"] },
    { id: 20140155, name: "workspace-concreto.jpg", folder: "Bastidores", tags: ["workspace", "minimal"] },
    { id: 37793421, name: "caderno-minimal.jpg", folder: "Lifestyle", tags: ["minimal", "papelaria"] },
    { id: 211856, name: "desk-abacaxi.jpg", folder: "Lifestyle", tags: ["desk", "tech"] },
    { id: 38241074, name: "sombra-janela.jpg", folder: "Campanhas", tags: ["luz", "textura"], fav: true },
    { id: 3568521, name: "flatlay-devices.jpg", folder: "Produtos", tags: ["tech", "flatlay"] },
    { id: 19793978, name: "editorial-cafe-oculos.jpg", folder: "Campanhas", tags: ["editorial", "café"], fav: true },
    { id: 18281417, name: "xicara-cafe-graos.jpg", folder: "Produtos", tags: ["café", "produto"], fav: true },
    { id: 692101, name: "dubai-golden-hour.jpg", folder: "Viagens", tags: ["dubai", "pôr do sol"] },
    { id: 10392613, name: "cidade-mar-entardecer.jpg", folder: "Viagens", tags: ["cidade", "mar"] },
    { id: 26851069, name: "montanhas-cidade.jpg", folder: "Viagens", tags: ["montanha", "cidade"] },
    { id: 28732782, name: "zurique-crepusculo.jpg", folder: "Viagens", tags: ["zurique", "aéreo"] },
    { id: 19675604, name: "bogota-aerea.jpg", folder: "Viagens", tags: ["bogotá", "aéreo"] },
    { id: 16929295, name: "ibirapuera-sao-paulo.jpg", folder: "Viagens", tags: ["são paulo", "parque"] },
    { id: 15949300, name: "vila-alpes-aerea.jpg", folder: "Viagens", tags: ["vila", "aéreo"] },
    { id: 28309428, name: "paris-rua.jpg", folder: "Viagens", tags: ["paris", "street"], fav: true },
    { id: 27082720, name: "osaka-skyline.jpg", folder: "Viagens", tags: ["osaka", "skyline"] },
    { id: 28818543, name: "litoral-iate.jpg", folder: "Viagens", tags: ["praia", "iate"] },
  ];
  const mediaRows = await db.insert(media).values(
    mediaDefs.map((m, i) => ({
      workspaceId: wid,
      folderId: F[m.folder].id,
      name: m.name,
      url: IMG(m.id),
      type: "image" as const,
      width: 1080, height: 1080,
      sizeKb: int(240, 980),
      tags: m.tags,
      isFavorite: Boolean((m as { fav?: boolean }).fav),
      createdAt: new Date(Date.now() - (mediaDefs.length - i) * 86400000 * 2),
    }))
  ).returning();
  const M = mediaRows.map((r) => r.url);
  const byPhoto = (photoId: number) => IMG(photoId);

  /* ---------------------------------- Posts ---------------------------------- */
  const publishedCaptions: { cap: string; client: string; nets: Platform[]; photo: number; format?: string }[] = [
    { cap: "O cheiro do café fresco chega antes da gente abrir a porta. ☕ Hoje tem edição limitada do nosso blend da casa.\n\n#cafealma #coffeebreak #blenddacasa", client: "Café Alma", nets: ["instagram", "facebook"], photo: 18281417 },
    { cap: "Mesa posta, luz boa e aquele tempo que só o domingo tem. Te esperamos das 9h às 14h. 🤎\n\n#brunch #cafealma #domingo", client: "Café Alma", nets: ["instagram"], photo: 19793978 },
    { cap: "Skincare não é luxo, é ritual. A nova linha Botanic chega dia 12 — e quem está na lista VIP experimenta antes. ✨ Link na bio.\n\n#velvetskin #skincare #botanic", client: "Velvet Skin", nets: ["instagram", "tiktok"], photo: 38241074, format: "reel" },
    { cap: "3 passos, 2 minutos, 1 pele descansada. O tutorial completo está no Reels de hoje. 💧\n\n#skincareroutine #velvetskin", client: "Velvet Skin", nets: ["instagram"], photo: 29765795 },
    { cap: "Zurique ao entardecer parece cenário de filme — mas é real, e cabe no seu próximo feriado. 🏙️ Roteiro completo no carrossel.\n\n#nomadatravel #zurique #europa", client: "Nómada Travel", nets: ["instagram"], photo: 28732782, format: "carousel" },
    { cap: "Dubai não tira o pé do acelerador e a gente não tira o olho dessa luz. 🌆\n\n#dubai #nomadatravel #goldenhour", client: "Nómada Travel", nets: ["instagram", "youtube"], photo: 692101 },
    { cap: "Dia 14 do Desafio 30: o corpo já pede, a mente ainda negocia. Constância vence motivação. 💪\n\n#atlasfit #desafio30 #treino", client: "Atlas Fit", nets: ["instagram", "x"], photo: 211856, format: "reel" },
    { cap: "Treinar em grupo muda tudo. Nova turma de funcional começa segunda — restam 6 vagas. Link na bio. 🔥\n\n#funcional #atlasfit #saude", client: "Atlas Fit", nets: ["instagram", "facebook" as Platform, "linkedin"], photo: 3568521 },
    { cap: "São Paulo vista de cima tem outro ritmo. Episódio novo do canal mostra 5 mirantes gratuitos da cidade. 🎥\n\n#saopaulo #nomadatravel #youtube", client: "Nómada Travel", nets: ["youtube", "instagram"], photo: 16929295 },
    { cap: "Paris não precisa de filtro — mas esse editorial ganhou um lugar especial na campanha. 🥐\n\n#paris #editorial #nomadatravel", client: "Nómada Travel", nets: ["instagram"], photo: 28309428 },
    { cap: "Osaka é caos organizado, neon e o melhor lamen da nossa vida. Guia completo no destaque Japão. 🍜\n\n#osaka #japao #nomadatravel", client: "Nómada Travel", nets: ["instagram"], photo: 27082720, format: "carousel" },
    { cap: "Antes e depois não é sobre estética — é sobre energia pra viver. Depoimento completo do Rafael no feed. 💬\n\n#atlasfit #transformacao #saude", client: "Atlas Fit", nets: ["instagram", "facebook" as Platform], photo: 20140155 },
    { cap: "A rotina de skincare ideal existe? Montamos um guia honesto com dermatologistas. Salve pra ler depois. 📌\n\n#skincare #velvetskin #guia", client: "Velvet Skin", nets: ["instagram"], photo: 37793421, format: "carousel" },
    { cap: "TikTok tentou nos ensinar a fazer espuma de leite. O resultado? Veja até o fim. 😅☕\n\n#barista #cafealma #failwin", client: "Café Alma", nets: ["tiktok", "instagram"], photo: 29765807, format: "reel" },
    { cap: "Tecnologia que cabe na mesa e na mochila. Kit home office completo com 20% off essa semana. 💻\n\n#setup #produtividade", client: "Café Alma", nets: ["instagram"], photo: 3568521 },
    { cap: "O litoral que você sonha existe a 2h de voo. Container promocional da semana: 4 diárias com café da manhã. ⛵\n\n#litoral #promocao #nomadatravel", client: "Nómada Travel", nets: ["instagram", "facebook" as Platform], photo: 28818543 },
    { cap: "Novo artigo no blog: como montar uma rotina de treinos sustentável depois dos 40. Link na bio. 📖", client: "Atlas Fit", nets: ["linkedin", "x"], photo: 29765797 },
    { cap: "Bogotá de cima: a cidade que cresce entre montanhas. Episódio estreia sexta no canal. 🏔️\n\n#bogota #colombia #nomadatravel", client: "Nómada Travel", nets: ["youtube"], photo: 19675604 },
  ];

  const postRows: (typeof posts.$inferInsert)[] = [];
  const now = Date.now();
  publishedCaptions.forEach((p, i) => {
    const daysAgo = int(1, 44);
    const d = new Date(now - daysAgo * 86400000);
    d.setHours(pick([9, 10, 11, 12, 18, 19, 20]), pick([0, 15, 30, 45]), 0, 0);
    const engBase = 600 + rnd() * 4200;
    postRows.push({
      workspaceId: wid, authorId: user.id, clientId: C[p.client].id,
      caption: p.cap, networks: p.nets, mediaUrls: [byPhoto(p.photo)],
      format: (p.format ?? "feed") as string, status: "published" as const,
      publishedAt: d, createdAt: new Date(d.getTime() - 86400000),
      metrics: {
        likes: Math.floor(engBase), comments: Math.floor(engBase * (0.04 + rnd() * 0.08)),
        shares: Math.floor(engBase * (0.05 + rnd() * 0.12)), saves: Math.floor(engBase * (0.06 + rnd() * 0.14)),
        reach: Math.floor(engBase * (6 + rnd() * 8)), clicks: Math.floor(engBase * (0.2 + rnd() * 0.5)),
      },
    });
  });

  // duplicate a few to get fuller history
  for (let i = 0; i < 14; i++) {
    const src = pick(publishedCaptions);
    const daysAgo = int(20, 70);
    const d = new Date(now - daysAgo * 86400000);
    d.setHours(pick([8, 12, 17, 19]), pick([0, 30]), 0, 0);
    const engBase = 400 + rnd() * 3000;
    postRows.push({
      workspaceId: wid, authorId: user.id, clientId: C[src.client].id,
      caption: src.cap, networks: src.nets, mediaUrls: [byPhoto(src.photo)],
      format: (src.format ?? "feed") as string, status: "published" as const, publishedAt: d,
      createdAt: new Date(d.getTime() - 86400000),
      metrics: {
        likes: Math.floor(engBase), comments: Math.floor(engBase * (0.04 + rnd() * 0.08)),
        shares: Math.floor(engBase * 0.08), saves: Math.floor(engBase * 0.09),
        reach: Math.floor(engBase * 8), clicks: Math.floor(engBase * 0.3),
      },
    });
  }

  const scheduledDefs = [
    { cap: "Sexta chegou com novidade: croissant de pistache em edição limitada. Só até acabar. 🥐\n\n#cafealma #sextou", client: "Café Alma", nets: ["instagram", "facebook"] as Platform[], photo: 18281417, inDays: 1, h: 9 },
    { cap: "Teaser: algo botânico está brotando no nosso laboratório. 🌿 Dia 12, no feed.\n\n#velvetskin #botanic #vemaí", client: "Velvet Skin", nets: ["instagram"] as Platform[], photo: 38241074, inDays: 2, h: 18 },
    { cap: "5 destinos para fugir do óbvio em 2026. O primeiro ninguém adivinha. 🧭\n\n#nomadatravel #destinos #viagem", client: "Nómada Travel", nets: ["instagram"] as Platform[], photo: 15949300, inDays: 3, h: 12, format: "carousel" },
    { cap: "Semana 3 do Desafio 30 começa agora. Treino do dia no Stories e check-in no feed. 💪\n\n#atlasfit #desafio30", client: "Atlas Fit", nets: ["instagram", "x"] as Platform[], photo: 211856, inDays: 4, h: 7, format: "story" },
    { cap: "Live gratuita: como montar rotina de skincare com dermatologista convidada. Quinta, 19h. 💧", client: "Velvet Skin", nets: ["instagram", "tiktok"] as Platform[], photo: 29765795, inDays: 5, h: 19 },
    { cap: "Passaporte carimbado em 30 países: os 5 que mudaram nossa forma de viajar. Episódio especial no canal. 🎬", client: "Nómada Travel", nets: ["youtube"] as Platform[], photo: 692101, inDays: 6, h: 20 },
    { cap: "Benefício corporativo: sua empresa com academia parceira. Propostas pelo link na bio. 🏢", client: "Atlas Fit", nets: ["linkedin"] as Platform[], photo: 3568521, inDays: 7, h: 10 },
    { cap: "Menu de outono chegou: especiarias, abóbora e o latte que virou febre no ano passado. 🍂☕", client: "Café Alma", nets: ["instagram", "facebook"] as Platform[], photo: 19793978, inDays: 8, h: 9 },
    { cap: "UGC da semana: vocês usando a linha Vitamina C e os resultados reais. Obrigada por compartilhar. 🧡", client: "Velvet Skin", nets: ["instagram"] as Platform[], photo: 37793421, inDays: 9, h: 17, format: "carousel" },
    { cap: "Roteiro suíço completo: 7 dias, 4 cidades, 1 passe de trem. Salve este post. 🇨🇭", client: "Nómada Travel", nets: ["instagram"] as Platform[], photo: 28732782, inDays: 10, h: 12 },
    { cap: "Mobilidade antes da carga: 4 exercícios que salvam seus ombros. Salve pra treinar depois. 📌", client: "Atlas Fit", nets: ["instagram", "x"] as Platform[], photo: 20140155, inDays: 11, h: 8, format: "reel" },
    { cap: "Domingo é dia de mesa cheia. Reservas pelo direct. 🤎", client: "Café Alma", nets: ["instagram"] as Platform[], photo: 29765807, inDays: 12, h: 10 },
    { cap: "Osaka à noite merecia um post só dela. Guia de izakayas no destaque. 🏮", client: "Nómada Travel", nets: ["instagram"] as Platform[], photo: 27082720, inDays: 13, h: 19 },
    { cap: "Promoção de inverno: pacotes para o litoral com até 30% off. ⛵", client: "Nómada Travel", nets: ["instagram", "facebook"] as Platform[], photo: 28818543, inDays: 14, h: 11 },
  ];
  scheduledDefs.forEach((s) => {
    const d = new Date(now + s.inDays * 86400000);
    d.setHours(s.h, 0, 0, 0);
    postRows.push({
      workspaceId: wid, authorId: user.id, clientId: C[s.client].id,
      caption: s.cap, networks: s.nets, mediaUrls: [byPhoto(s.photo)],
      format: ((s as { format?: string }).format ?? "feed") as string,
      status: "scheduled" as const, scheduledAt: d,
    });
  });

  const drafts = [
    { cap: "Rascunho: parceria com a padaria do bairro pro café da manhã coletivo…", client: "Café Alma", nets: ["instagram"] as Platform[], photo: 29765797 },
    { cap: "Ideia: série 'mito ou verdade' sobre ingredientes de skincare", client: "Velvet Skin", nets: ["instagram", "tiktok"] as Platform[], photo: 29765795 },
    { cap: "Novo formato: guias de viagem em PDF pra baixar no link da bio", client: "Nómada Travel", nets: ["instagram"] as Platform[], photo: 28309428, format: "pdf" },
  ];
  drafts.forEach((dr) => {
    postRows.push({
      workspaceId: wid, authorId: user.id, clientId: C[dr.client].id,
      caption: dr.cap, networks: dr.nets, mediaUrls: [byPhoto(dr.photo)],
      format: ((dr as { format?: string }).format ?? "feed") as string, status: "draft" as const,
    });
  });
  await db.insert(posts).values(postRows);

  /* ---------------------------------- Inbox ---------------------------------- */
  const inboxDefs = [
    { platform: "instagram" as Platform, type: "comment", author: "Beatriz Lemos", handle: "bia.lemos", color: "#AB2F5F", text: "Esse blend da casa é o mesmo que vocês servem na unidade do centro? Quero muito provar!", post: "O cheiro do café fresco chega antes da gente abrir…", h: 0.5 },
    { platform: "instagram" as Platform, type: "mention", author: "Guia Comer & Beber", handle: "guiacomerbeber", color: "#3E6C8E", text: "O @cafealma entrou na nossa lista dos 10 cafés mais charmosos da cidade. Parabéns pela curadoria! 👏", post: "", h: 2 },
    { platform: "facebook" as Platform, type: "message", author: "Sr. Antônio Ferreira", handle: "antonio.ferreira", color: "#8A6D3B", text: "Bom dia! Vocês fazem encomenda de bolo de cenoura pra retirada no sábado? Seriam 2 unidades.", post: "", h: 3 },
    { platform: "tiktok" as Platform, type: "comment", author: "Duda Makeup", handle: "dudamakeup", color: "#6B5B95", text: "Fiz a rotina dos 3 passos por uma semana e minha pele AGRADECE. A linha Botanic vai ter serum?", post: "3 passos, 2 minutos, 1 pele descansada…", h: 4 },
    { platform: "instagram" as Platform, type: "comment", author: "Carlos Menezes", handle: "cmenezes", color: "#3F7D5D", text: "Preço da live de quinta é acessível pra quem é aluno? Sou da turma das 6h 💪", post: "Live gratuita: como montar rotina…", h: 6 },
    { platform: "instagram" as Platform, type: "message", author: "Fernanda Saito", handle: "fe.saito", color: "#C2410C", text: "Oi! Quero presentear minha mãe com uma cesta de vocês. Vocês montam personalizada? Qual o prazo?", post: "", h: 8 },
    { platform: "youtube" as Platform, type: "comment", author: "Mochila nas Costas", handle: "@mochilanascostas", color: "#3E6C8E", text: "O episódio dos mirantes de SP ficou impecável. Aquela tomada do Ibirapuera no drone foi cinema. Já salvei 3 dicas!", post: "São Paulo vista de cima tem outro ritmo…", h: 10 },
    { platform: "x" as Platform, type: "mention", author: "Blog Corpo em Foco", handle: "corpoemfoco", color: "#20242B", text: "O Desafio 30 da @atlasfit é um case interessante de engajamento em fitness. Thread sobre a estratégia 🧵", post: "", h: 12 },
    { platform: "instagram" as Platform, type: "comment", author: "Luiza Barbosa", handle: "lu.barbosa", color: "#AB2F5F", text: "A paleta desse editorial de Paris tá PERFEITA. Quem foi o fotógrafo?", post: "Paris não precisa de filtro…", h: 26 },
    { platform: "facebook" as Platform, type: "comment", author: "Marta Gonçalves", handle: "marta.g", color: "#8A6D3B", text: "Fui no brunch de domingo e o atendimento foi impecável. O croissant de amêndoas é surreal.", post: "Mesa posta, luz boa e aquele tempo…", h: 28 },
    { platform: "instagram" as Platform, type: "message", author: "Pedro Haven", handle: "pedrohaven", color: "#3F7D5D", text: "Boa tarde! Vocês têm plano trimestral com personal incluso? Moro perto da unidade norte.", post: "", h: 30 },
    { platform: "tiktok" as Platform, type: "comment", author: "Skin Diário", handle: "skindiario", color: "#6B5B95", text: "A parte 2 do tutorial de espuma saiu?? Kkkk preciso ver o desfecho", post: "TikTok tentou nos ensinar a fazer espuma…", h: 40 },
    { platform: "linkedin" as Platform, type: "message", author: "RH Vetor Tech", handle: "rhvetor", color: "#3E6C8E", text: "Olá, equipe Atlas. Somos uma empresa de 240 colaboradores e gostaríamos de uma proposta de benefício corporativo.", post: "", h: 44 },
    { platform: "instagram" as Platform, type: "comment", author: "Ana Khouri", handle: "anakhouri", color: "#C2410C", text: "Zurique tá no topo da lista faz anos. Esse roteiro do carrossel pra quantos dias é?", post: "Zurique ao entardecer parece cenário…", h: 50 },
    { platform: "instagram" as Platform, type: "comment", author: "Rafaela Pinto", handle: "rafapinto", color: "#AB2F5F", text: "Salvando tudo da linha Botanic. Quando abre a lista VIP? ✨", post: "Skincare não é luxo, é ritual…", h: 52 },
  ];
  await db.insert(inboxItems).values(
    inboxDefs.map((m, i) => ({
      workspaceId: wid, platform: m.platform, type: m.type,
      authorName: m.author, authorHandle: m.handle, authorColor: m.color,
      text: m.text, postPreview: m.post,
      status: i < 6 ? ("unread" as const) : i < 9 ? ("read" as const) : ("read" as const),
      isFavorite: i === 1 || i === 6,
      createdAt: new Date(now - m.h * 3600000),
      replies: i === 9 ? [{ text: "Marta, muito obrigado pelo carinho! Vamos repassar pra equipe 🤎", at: new Date(now - 26 * 3600000).toISOString(), by: "Marina Duarte" }] : i === 6 ? [{ text: "Muito obrigado pela força! O episódio de Bogotá estreia sexta 🎬", at: new Date(now - 8 * 3600000).toISOString(), by: "Marina Duarte" }] : [],
    }))
  );

  /* ------------------------------ Notifications ------------------------------ */
  const notifDefs = [
    { title: "Publicação agendada para hoje", body: "O post do Café Alma vai ao ar às 9h no Instagram e Facebook.", kind: "info", h: 1 },
    { title: "Pico de engajamento detectado", body: "O Reels da Velvet Skin superou a média em 240% nas últimas 24h.", kind: "success", h: 5 },
    { title: "Conexão do TikTok expira em 7 dias", body: "Renove a autorização da conta @velvetskin para evitar falhas de publicação.", kind: "warning", h: 9 },
    { title: "Novo comentário em destaque", body: "Guia Comer & Beber mencionou o Café Alma.", kind: "info", h: 12 },
    { title: "Relatório semanal pronto", body: "O resumo de desempenho de 11–17 está disponível em Analytics.", kind: "success", h: 30 },
    { title: "Convite pendente", body: "tomas@cafealma.com.br ainda não aceitou o convite para o workspace.", kind: "warning", h: 52 },
  ];
  await db.insert(notifications).values(
    notifDefs.map((n, i) => ({
      workspaceId: wid, title: n.title, body: n.body, kind: n.kind,
      read: i > 2, createdAt: new Date(now - n.h * 3600000),
    }))
  );

  /* ------------------------------- Analytics --------------------------------- */
  const analyticsRows: (typeof analyticsDaily.$inferInsert)[] = [];
  for (const acc of accountRows) {
    const base = accountDefs.find((a) => a.handle === acc.handle)!.followers * (1 - 0.004 * DAYS);
    const weekendBoost = ["instagram", "tiktok"].includes(acc.platform) ? 1.45 : 1.05;
    for (let i = 0; i < DAYS; i++) {
      const day = new Date(now - (DAYS - 1 - i) * 86400000);
      const dow = day.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const growth = base * (1 + 0.004 * i) * (1 + Math.sin(i / 5.3) * 0.02);
      const reachBase = growth * (0.09 + rnd() * 0.13) * (isWeekend ? weekendBoost : 1);
      const reach = Math.floor(reachBase);
      const impressions = Math.floor(reach * (1.55 + rnd() * 0.7));
      const likes = Math.floor(reach * (0.035 + rnd() * 0.045));
      analyticsRows.push({
        workspaceId: wid, socialAccountId: acc.id, platform: acc.platform,
        day: dayStr(day),
        followers: Math.floor(growth),
        reach, impressions, likes,
        comments: Math.floor(likes * (0.06 + rnd() * 0.08)),
        shares: Math.floor(likes * (0.1 + rnd() * 0.14)),
        saves: Math.floor(likes * (0.12 + rnd() * 0.16)),
        clicks: Math.floor(reach * (0.015 + rnd() * 0.02)),
      });
    }
  }
  // chunk inserts
  for (let i = 0; i < analyticsRows.length; i += 200) {
    await db.insert(analyticsDaily).values(analyticsRows.slice(i, i + 200));
  }

  /* ------------------------------ Activity logs ------------------------------- */
  const logDefs = [
    { actor: "Marina Duarte", color: "#AB2F5F", action: "agendou 3 publicações para o Café Alma", entity: "posts", h: 1 },
    { actor: "Rafael Costa", color: "#3E6C8E", action: "respondeu 2 mensagens na Caixa de Entrada", entity: "inbox", h: 3 },
    { actor: "Luísa Prado", color: "#6B5B95", action: "enviou 4 novas mídias para a pasta Campanhas", entity: "media", h: 6 },
    { actor: "Marina Duarte", color: "#AB2F5F", action: "duplicou a publicação 'Skincare não é luxo…'", entity: "posts", h: 9 },
    { actor: "Rafael Costa", color: "#3E6C8E", action: "moveu um post de 14/03 para 18/03 no calendário", entity: "calendar", h: 26 },
    { actor: "Marina Duarte", color: "#AB2F5F", action: "exportou relatório de analytics em CSV", entity: "analytics", h: 30 },
    { actor: "Luísa Prado", color: "#6B5B95", action: "criou a pasta Bastidores na biblioteca", entity: "media", h: 48 },
    { actor: "Marina Duarte", color: "#AB2F5F", action: "convidou tomas@cafealma.com.br como Cliente", entity: "team", h: 55 },
    { actor: "Rafael Costa", color: "#3E6C8E", action: "arquivou 5 itens da Caixa de Entrada", entity: "inbox", h: 70 },
    { actor: "Marina Duarte", color: "#AB2F5F", action: "criou o cliente Atlas Fit no workspace", entity: "clients", h: 120 },
  ];
  await db.insert(activityLogs).values(
    logDefs.map((l) => ({
      workspaceId: wid, userId: user.id, actorName: l.actor, actorColor: l.color,
      action: l.action, entity: l.entity,
      createdAt: new Date(now - l.h * 3600000),
    }))
  );

  await db.insert(apiKeys).values([
    { workspaceId: wid, name: "Integração Zapier", prefix: "pl_live_", key: `pl_live_${randomBytes(18).toString("hex")}`, lastUsedAt: new Date(now - 26 * 3600000) },
    { workspaceId: wid, name: "Dashboard interno", prefix: "pl_live_", key: `pl_live_${randomBytes(18).toString("hex")}`, lastUsedAt: new Date(now - 5 * 86400000) },
  ]);

  await db.insert(webhooks).values([
    { workspaceId: wid, url: "https://hooks.zapier.com/hooks/catch/aurora/postline", events: ["post.published", "post.failed"], active: true },
  ]);

  console.log("✓ Demo data ready — login: demo@postline.app / demo1234");
  console.log(`  media urls available: ${M.length}, days: ${DAYS}, analytics rows: ${analyticsRows.length}, logs at ${iso(new Date())}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
