import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
const COOKIE = "bountyos_session";
const secret = () => process.env.SESSION_SECRET || "development-only-change-me";
const sign = (value: string) => crypto.createHmac("sha256", secret()).update(value).digest("hex");
export function makeSession(userId: string) { return `${userId}.${sign(userId)}`; }
export async function getCurrentUser() {
  const value = (await cookies()).get(COOKIE)?.value; if (!value) return null;
  const [id, sig] = value.split("."); if (!id || !sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(id)))) return null;
  return db.user.findUnique({ where: { id } });
}
export const sessionCookie = COOKIE;
export const sessionOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 };
