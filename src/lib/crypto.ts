import crypto from "node:crypto";
const key=()=>crypto.createHash("sha256").update(process.env.SESSION_SECRET||"development-only-change-me").digest();
export function encryptSecret(value:string){const iv=crypto.randomBytes(12);const c=crypto.createCipheriv("aes-256-gcm",key(),iv);const data=Buffer.concat([c.update(value,"utf8"),c.final()]);return [iv.toString("base64url"),c.getAuthTag().toString("base64url"),data.toString("base64url")].join(".")}
export function decryptSecret(value:string){const [iv,tag,data]=value.split(".");const d=crypto.createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64url"));d.setAuthTag(Buffer.from(tag,"base64url"));return Buffer.concat([d.update(Buffer.from(data,"base64url")),d.final()]).toString("utf8")}
