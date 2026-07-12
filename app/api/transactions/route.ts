import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type TxType = "income" | "expense";

const COOKIE_NAME = "miyamu_user_key";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeAndValidateKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const key = raw.trim();

  if (key.length < 8 || key.length > 64) return null;

  return key;
}

// header優先 → cookie fallback
function getUserKey(req: NextRequest): string | null {
  const headerKey = normalizeAndValidateKey(
    req.headers.get("x-user-key")
  );

  if (headerKey) return headerKey;

  const cookieKey = normalizeAndValidateKey(
    req.cookies.get(COOKIE_NAME)?.value
  );

  if (cookieKey) return cookieKey;

  return null;
}

function parseAmount(value: unknown): number {
  const text = String(value ?? "")
    .trim()
    .replace(/[０-９]/g, (character) =>
      String(character.charCodeAt(0) - 0xfee0)
    )
    .replace(/[,，]/g, "");

  return Number(text);
}

function parseOccurredAt(value: unknown): Date | null {
  if (!value) return null;

  const date = new Date(String(value).trim());

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

// バックアップ内の明細をDB保存用に整える
function parseBackupTransaction(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const transaction = value as Record<string, unknown>;

  const amount = parseAmount(transaction.amount);
  const category = String(transaction.category ?? "").trim();

  const detailCategoryRaw = String(
    transaction.detailCategory ?? ""
  ).trim();

  const detailCategory = detailCategoryRaw
    ? detailCategoryRaw.slice(0, 64)
    : null;

  const type = transaction.type as TxType;
  const occurredAt = parseOccurredAt(transaction.occurredAt);

  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!category) return null;
  if (type !== "income" && type !== "expense") return null;
  if (!occurredAt) return null;

  return {
    amount: Math.trunc(amount),
    category,
    detailCategory,
    type,
    occurredAt,
  };
}

// 明細一覧取得
export async function GET(req: NextRequest) {
  try {
    const userKey = getUserKey(req);

    if (!userKey) {
      return badRequest(
        "user key is required (x-user-key header or cookie)"
      );
    }

    const transactions = await prisma.transaction.findMany({
      where: { userKey },
      orderBy: [
        { occurredAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// 明細を1件追加
export async function POST(req: NextRequest) {
  try {
    const userKey = getUserKey(req);

    if (!userKey) {
      return badRequest(
        "user key is required (x-user-key header or cookie)"
      );
    }

    const body = await req.json();

    const amount = parseAmount(body.amount);
    const category = String(body.category ?? "").trim();

    const detailCategoryRaw = String(
      body.detailCategory ?? ""
    ).trim();

    const detailCategory = detailCategoryRaw
      ? detailCategoryRaw.slice(0, 64)
      : null;

    const type = body.type as TxType;
    const occurredAt =
      parseOccurredAt(body.occurredAt) ?? new Date();

    if (!Number.isFinite(amount) || amount <= 0) {
      return badRequest("amount must be a positive number");
    }

    if (!category) {
      return badRequest("category is required");
    }

    if (type !== "income" && type !== "expense") {
      return badRequest(
        'type must be "income" or "expense"'
      );
    }

    const created = await prisma.transaction.create({
      data: {
        userKey,
        amount: Math.trunc(amount),
        category,
        detailCategory,
        type,
        occurredAt,
      },
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// バックアップから明細一覧を丸ごと復元
export async function PUT(req: NextRequest) {
  try {
    const userKey = getUserKey(req);

    if (!userKey) {
      return badRequest(
        "user key is required (x-user-key header or cookie)"
      );
    }

    const body = (await req.json()) as {
  transactions?: unknown;
};

if (!Array.isArray(body.transactions)) {
  return badRequest("transactions must be an array");
}

type BackupTransaction = NonNullable<
  ReturnType<typeof parseBackupTransaction>
>;

const transactions: BackupTransaction[] =
  body.transactions.flatMap((value: unknown): BackupTransaction[] => {
    const parsedTransaction = parseBackupTransaction(value);

    if (parsedTransaction === null) {
      return [];
    }

    return [parsedTransaction];
  });
    if (transactions.length === 0) {
  await prisma.transaction.deleteMany({
    where: { userKey },
  });
} else {
  await prisma.$transaction([
    prisma.transaction.deleteMany({
      where: { userKey },
    }),

    prisma.transaction.createMany({
      data: transactions.map((transaction) => ({
        ...transaction,
        userKey,
      })),
    }),
  ]);
}

    return NextResponse.json({
      ok: true,
      count: transactions.length,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// 明細を1件削除
export async function DELETE(req: NextRequest) {
  try {
    const userKey = getUserKey(req);

    if (!userKey) {
      return badRequest(
        "user key is required (x-user-key header or cookie)"
      );
    }

    const idText = new URL(req.url).searchParams.get("id");
    const id = Number(idText);

    if (!idText || !Number.isFinite(id) || id <= 0) {
      return badRequest("id is required");
    }

    const deleted = await prisma.transaction.deleteMany({
      where: {
        id,
        userKey,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// 明細を1件編集
export async function PATCH(req: NextRequest) {
  try {
    const userKey = getUserKey(req);

    if (!userKey) {
      return badRequest(
        "user key is required (x-user-key header or cookie)"
      );
    }

    const idText = new URL(req.url).searchParams.get("id");
    const id = Number(idText);

    if (!idText || !Number.isFinite(id) || id <= 0) {
      return badRequest("id is required");
    }

    const body = await req.json();

    const amount = parseAmount(body.amount);
    const category = String(body.category ?? "").trim();

    const detailCategoryRaw = String(
      body.detailCategory ?? ""
    ).trim();

    const detailCategory = detailCategoryRaw
      ? detailCategoryRaw.slice(0, 64)
      : null;

    const type = body.type as TxType;
    const occurredAt = parseOccurredAt(body.occurredAt);

    if (!Number.isFinite(amount) || amount <= 0) {
      return badRequest("amount must be a positive number");
    }

    if (!category) {
      return badRequest("category is required");
    }

    if (type !== "income" && type !== "expense") {
      return badRequest(
        'type must be "income" or "expense"'
      );
    }

    if (!occurredAt) {
      return badRequest(
        "occurredAt is required (YYYY-MM-DD)"
      );
    }

    const updated = await prisma.transaction.updateMany({
      where: {
        id,
        userKey,
      },
      data: {
        amount: Math.trunc(amount),
        category,
        detailCategory,
        type,
        occurredAt,
      },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404 }
      );
    }

    const latest = await prisma.transaction.findFirst({
      where: {
        id,
        userKey,
      },
    });

    if (!latest) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(latest);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}