import crypto from "node:crypto";import {cookies} from "next/headers";import {db} from "./db";
const COOKIE="bountyos_session";const secret=()=>process.env.SESSION_SECRET||"development-only-change-me";const sign=(v:string)=>crypto.createHmac("sha256",secret()).update(v).digest("hex");
export function makeSession(id:string){return `${id}.${sign(id)}`}
export async function getCurrentUser(){const value=(await cookies()).get(COOKIE)?.value;if(!value)return null;const [id,sig]=value.split(".");const expected=sign(id||"");if(!id||!sig||sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;return db.user.findUnique({where:{id}})}
export const sessionCookie=COOKIE;export const sessionOptions={httpOnly:true,sameSite:"lax" as const,secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*30};
