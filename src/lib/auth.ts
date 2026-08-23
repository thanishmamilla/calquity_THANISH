import { cookies } from "next/headers";
import { sessionFromUser, userById } from "./users";
import type { Session } from "./types";

const COOKIE = "pp_uid";

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const userId = jar.get(COOKIE)?.value;
  if (!userId) return null;
  const user = userById(userId);
  return user ? sessionFromUser(user) : null;
}

export async function writeSession(userId: string): Promise<Session | null> {
  const user = userById(userId);
  if (!user) return null;
  const jar = await cookies();
  jar.set(COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  return sessionFromUser(user);
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
