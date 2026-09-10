import { NextResponse } from "next/server";
import { GitHubBountySource } from "@/integrations/github/bounty-source";
import { analyzeBountyWithOllama } from "@/lib/ai/bounty-analyzer";
import { getCurrentUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (process.env.OLLAMA_ENABLED === "false") {
      return NextResponse.json({ error: "Local AI analysis is disabled." }, { status: 503 });
    }

    const { id } = await params;
    const user = await getCurrentUser();
    let githubToken: string | undefined;
    if (user?.githubAccessToken) {
      try { githubToken = decryptSecret(user.githubAccessToken); } catch { githubToken = undefined; }
    }

    const source = new GitHubBountySource(githubToken);
    const bounty = await source.getBounty(decodeURIComponent(id));
    if (!bounty) return NextResponse.json({ error: "Bounty not found" }, { status: 404 });

    const analysis = await analyzeBountyWithOllama(bounty);
    return NextResponse.json({ provider: "ollama", model: process.env.OLLAMA_MODEL || "qwen2.5-coder:7b", analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ollama analysis failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
