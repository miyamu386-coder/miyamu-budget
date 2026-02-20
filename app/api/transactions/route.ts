import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type TxType = "income" | "expense";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function getUserKey(req: Request): string | null {
  const userKey = req.headers.get("x-user-key")?.trim();
  if (!userKey) return null;
  if (userKey.length < 8 || userKey.length > 64) return null;
  return userKey;
}

function parseAmount(value: unknown): number {
  const s = String(value ?? "")
    .trim()
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xfee0))
    .replace(/[,，]/g, "");
  return Number(s);
}

function parseOccurredAt(value: unknown): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(req: Request) {
  try {
    const userKey = getUserKey(req);
    if (!userKey) return badRequest("x-user-key header is required");

    const transactions = await prisma.transaction.findMany({
      where: { userKey },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(transactions);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userKey = getUserKey(req);
    if (!userKey) return badRequest("x-user-key header is required");

    const body = await req.json();

    const amount = parseAmount(body.amount);
    const category = String(body.category ?? "").trim();

    const detailCategoryRaw = String(body.detailCategory ?? "").trim();
    const detailCategory = detailCategoryRaw ? detailCategoryRaw.slice(0, 64) : null;
    const type = body.type as TxType;
    const occurredAt = parseOccurredAt(body.occurredAt) ?? new Date();

    if (!Number.isFinite(amount) || amount <= 0)
      return badRequest("amount must be a positive number");
    if (!category) return badRequest("category is required");
    if (type !== "income" && type !== "expense")
      return badRequest('type must be "income" or "expense"');

    const created = await prisma.transaction.create({
      data: {
        userKey,
        amount: Math.trunc(amount),
        category,
        detailCategory,  //
        type,
        occurredAt,
      },
    });

    return NextResponse.json(created);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userKey = getUserKey(req);
    if (!userKey) return badRequest("x-user-key header is required");

    const idStr = new URL(req.url).searchParams.get("id");
    const id = Number(idStr);
    if (!idStr || !Number.isFinite(id) || id <= 0) return badRequest("id is required");

    const deleted = await prisma.transaction.deleteMany({
      where: { id, userKey },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const userKey = getUserKey(req);
    if (!userKey) return badRequest("x-user-key header is required");

    const idStr = new URL(req.url).searchParams.get("id");
    const id = Number(idStr);
    if (!idStr || !Number.isFinite(id) || id <= 0) return badRequest("id is required");

    const body = await req.json();

    const amount = parseAmount(body.amount);
    const category = String(body.category ?? "").trim();
    const type = body.type as TxType;
    const occurredAt = parseOccurredAt(body.occurredAt);

    if (!Number.isFinite(amount) || amount <= 0)
      return badRequest("amount must be a positive number");
    if (!category) return badRequest("category is required");
    if (type !== "income" && type !== "expense")
      return badRequest('type must be "income" or "expense"');
    if (!occurredAt) return badRequest("occurredAt is required (YYYY-MM-DD)");

    const updated = await prisma.transaction.updateMany({
      where: { id, userKey },
      data: { amount: Math.trunc(amount), category, type, occurredAt },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const latest = await prisma.transaction.findFirst({
      where: { id, userKey },
    });

    if (!latest) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(latest);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}