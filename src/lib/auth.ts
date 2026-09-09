import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE = "bountyos_session";
const secret = () => process.env.SESSION_SECRET || "development-only-change-me";
const sign = (value: string) => crypto.createHmac("sha256", secret()).update(value).digest("hex");

export function makeSession(id: string) {
  return `${id}.${sign(id)}`;
}

export async function getCurrentUser() {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;

  const [id, sig] = value.split(".");
  const expected = sign(id || "");
  if (!id || !sig || sig.length !== expected.length) return null;

  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  return db.user.findUnique({
    where: { id },
    include: {
      skills: true,
      preferences: true,
    },
  });
}

export const sessionCookie = COOKIE;
export const sessionOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};
