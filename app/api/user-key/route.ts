import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "miyamu_user_key";

function normalizeAndValidateKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  if (key.length < 8 || key.length > 64) return null;
  return key;
}

function genKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function GET(req: NextRequest) {
  const existingRaw = req.cookies.get(COOKIE_NAME)?.value;
  const existing = normalizeAndValidateKey(existingRaw);

  const key = existing ?? genKey();
  const res = NextResponse.json({ userKey: key });

  // 既存cookieが無い/壊れてる → 上書きして復旧
  if (!existing) {
    res.cookies.set({
      name: COOKIE_NAME,
      value: key,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365 * 5,
    });
  }

  return res;
}