// app/api/user-key/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function isValidUserKey(v: string) {
  // 例：32文字の16進数（今の 3e15a0... 形式に合わせる）
  return /^[0-9a-f]{32}$/i.test(v);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { userKey?: string } | null;
  const userKey = body?.userKey?.trim() ?? "";

  if (!isValidUserKey(userKey)) {
    return NextResponse.json({ error: "Invalid userKey" }, { status: 400 });
  }

  // ✅ cookie書き換え（GET側と同じキー名/オプションに合わせてね）
  const c = await cookies();
  c.set("userKey", userKey, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365, // 1年
  });

  return NextResponse.json({ ok: true, userKey });
}