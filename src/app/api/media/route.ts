import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { media, folders } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, desc, eq, isNull, isNotNull, sql, SQL } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const conds: SQL[] = [eq(media.workspaceId, user.workspaceId), isNull(media.deletedAt)];
  const folderId = sp.get("folder");
  const type = sp.get("type");
  const q = sp.get("q")?.trim();
  const trash = sp.get("trash") === "1";
  const favorites = sp.get("favorites") === "1";
  const limit = Math.min(Number(sp.get("limit") ?? 24), 60);
  const offset = Number(sp.get("offset") ?? 0);

  if (trash) conds.push(isNotNull(media.trashedAt));
  else conds.push(isNull(media.trashedAt));
  if (folderId) conds.push(eq(media.folderId, folderId));
  if (type) conds.push(eq(media.type, type));
  if (favorites) conds.push(eq(media.isFavorite, true));
  if (q) conds.push(sql`(${media.name} ILIKE ${"%" + q + "%"} OR ${media.tags}::text ILIKE ${"%" + q + "%"})`);

  const [rows, countRows, folderRows] = await Promise.all([
    db.select().from(media).where(and(...conds)).orderBy(desc(media.createdAt)).limit(limit + 1).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(media).where(and(...conds)),
    db.select().from(folders).where(and(eq(folders.workspaceId, user.workspaceId), isNull(folders.deletedAt))).orderBy(folders.name),
  ]);

  return NextResponse.json({
    media: rows.slice(0, limit),
    hasMore: rows.length > limit,
    total: Number(countRows[0]?.count ?? 0),
    folders: folderRows,
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await req.json();

  if (body.action === "createFolder") {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Nome obrigatório." }, { status: 400 });
    const palette = ["#AB2F5F", "#3E6C8E", "#3F7D5D", "#6B5B95", "#8A6D3B"];
    const [folder] = await db.insert(folders).values({
      workspaceId: user.workspaceId, name, color: palette[Math.floor(Math.random() * palette.length)],
    }).returning();
    return NextResponse.json({ folder }, { status: 201 });
  }

  const name = String(body.name ?? "").trim();
  const url = String(body.url ?? "");
  if (!name || !url) return NextResponse.json({ error: "Nome e URL são obrigatórios." }, { status: 400 });
  if (url.length > 900_000) return NextResponse.json({ error: "Arquivo muito grande (máx. ~700KB nesta demo)." }, { status: 413 });

  const [row] = await db.insert(media).values({
    workspaceId: user.workspaceId,
    folderId: body.folderId || null,
    name: name.slice(0, 200),
    url,
    type: body.type ?? "image",
    width: body.width ?? 1080,
    height: body.height ?? 1080,
    sizeKb: body.sizeKb ?? Math.max(1, Math.floor(url.length / 1366)),
    tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 8) : [],
  }).returning();

  return NextResponse.json({ media: row }, { status: 201 });
}
