import { NextResponse } from "next/server";

export async function GET() {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  const configured = provider === "gemini" ? Boolean(process.env.GEMINI_API_KEY ?? process.env.AI_API_KEY) : provider === "ollama";
  return NextResponse.json({ provider, configured, model: provider === "gemini" ? process.env.GEMINI_MODEL ?? "gemini-3.7-flash" : process.env.OLLAMA_MODEL ?? "qwen3-coder" });
}
