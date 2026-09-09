import {NextResponse} from "next/server";import {sessionCookie} from "@/lib/auth";
export async function POST(req:Request){const r=NextResponse.redirect(new URL("/",req.url));r.cookies.delete(sessionCookie);return r}
