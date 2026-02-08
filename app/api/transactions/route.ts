import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type TxType = "income" | "expense";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

// 全角→半角、カンマ除去などして数値化
function parseAmount(value: unknown): number {
  const s = String(value ?? "")
    .trim()
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xfee0))
    .replace(/[,，]/g, "");
  return Number(s);
}

function parseOccurredAt(value: unknown): Date | null {
  if (!value) return null;

  // "YYYY-MM-DD" または ISO を想定
  const s = String(value).trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET() {
  const transactions = await prisma.transaction.findMany({
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(transactions);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const amount = parseAmount(body.amount);
    const category = String(body.category ?? "").trim();
    const type = body.type as TxType;
    const occurredAt = parseOccurredAt(body.occurredAt) ?? new Date();

    if (!Number.isFinite(amount) || amount <= 0) return badRequest("amount must be a positive number");
    if (!category) return badRequest("category is required");
    if (type !== "income" && type !== "expense") return badRequest('type must be "income" or "expense"');

    const created = await prisma.transaction.create({
      data: { amount: Math.trunc(amount), category, type, occurredAt },
    });

    return NextResponse.json(created);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const idStr = new URL(req.url).searchParams.get("id");
    const id = Number(idStr);

    if (!idStr || !Number.isFinite(id) || id <= 0) return badRequest("id is required");

    await prisma.transaction.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const idStr = new URL(req.url).searchParams.get("id");
    const id = Number(idStr);

    if (!idStr || !Number.isFinite(id) || id <= 0) return badRequest("id is required");

    const body = await req.json();

    const amount = parseAmount(body.amount);
    const category = String(body.category ?? "").trim();
    const type = body.type as TxType;
    const occurredAt = parseOccurredAt(body.occurredAt);

    if (!Number.isFinite(amount) || amount <= 0) return badRequest("amount must be a positive number");
    if (!category) return badRequest("category is required");
    if (type !== "income" && type !== "expense") return badRequest('type must be "income" or "expense"');
    if (!occurredAt) return badRequest("occurredAt is required (YYYY-MM-DD)");

    const updated = await prisma.transaction.update({
      where: { id },
      data: { amount: Math.trunc(amount), category, type, occurredAt },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}