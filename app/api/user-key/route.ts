// app/api/user-key/route.ts

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "miyamu_user_key";

function isValidUserKey(value: string) {
  return /^[0-9a-f]{32}$/i.test(value);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { userKey?: string }
    | null;

  const userKey = body?.userKey?.trim() ?? "";

  if (!isValidUserKey(userKey)) {
    return NextResponse.json(
      { error: "Invalid userKey" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, userKey, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({
    ok: true,
    userKey,
  });
}