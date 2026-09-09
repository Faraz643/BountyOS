import { NextResponse } from "next/server";
import { GitHubBountySource } from "@/integrations/github/bounty-source";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const minReward = Number(url.searchParams.get("minReward") || 0);
  try {
    const bounties = await new GitHubBountySource().search({ query: url.searchParams.get("q") || undefined, minReward: Number.isFinite(minReward) ? minReward : undefined });
    return NextResponse.json({ data: bounties, count: bounties.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bounty discovery failed" }, { status: 502 });
  }
}
