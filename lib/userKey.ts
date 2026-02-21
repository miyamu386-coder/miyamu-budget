let cached: string | null = null;

export async function getOrCreateUserKey(): Promise<string> {
  if (cached) return cached;

  const res = await fetch("/api/user-key", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to get userKey");
  }

  const data = (await res.json()) as { userKey: string };
  cached = data.userKey;

  return cached;
}