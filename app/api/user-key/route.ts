import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "miyamu_budget_user_key";

function normalizeKey(s: string) {
  return s.trim().slice(0, 64);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const peek = url.searchParams.get("peek") === "1";

  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value ?? null;

  // ✅ peek は「読むだけ」。無ければ null を返す（新規発行しない）
  if (peek) {
    return NextResponse.json({ userKey: existing });
  }

  // ここから下は「従来通り：無ければ作る」
  if (existing) return NextResponse.json({ userKey: existing });

  const created = crypto.randomUUID(); // 例
  jar.set(COOKIE_NAME, created, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ userKey: created });
}
