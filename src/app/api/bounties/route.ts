import { NextResponse } from "next/server";
import { GitHubBountySource } from "@/integrations/github/bounty-source";
import { buildAnalysis } from "@/lib/bounty/scoring";
import { analyzeBountyWithOllama } from "@/lib/ai/bounty-analyzer";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const u = new URL(request.url);
  const min = Number(u.searchParams.get("minReward") || 0);
  const mode = u.searchParams.get("mode") || "verified";
  const paidOnly = mode !== "all";
  const verifiedOnly = mode === "verified";
  try {
    const user = await getCurrentUser();
    let githubToken: string | undefined;
    if (user?.githubAccessToken) {
      try { githubToken = decryptSecret(user.githubAccessToken); } catch { githubToken = undefined; }
    }

    const source = new GitHubBountySource(githubToken);
    const raw = await source.search({ query: u.searchParams.get("q") || undefined, minReward: Number.isFinite(min) ? min : undefined, paidOnly, verifiedOnly });
    const profile = user ? { languages: user.skills.filter(s => s.category === "language").map(s => s.name), frameworks: user.skills.filter(s => s.category === "framework").map(s => s.name), databases: user.skills.filter(s => s.category === "database").map(s => s.name), level: (user.skills[0]?.level || "intermediate") as any, minimumBounty: user.preferences?.minimumBounty ?? undefined, maxEstimatedHours: user.preferences?.maxEstimatedHours ?? undefined, preferredCurrencies: user.preferences?.currencies ?? undefined } : { languages: [], frameworks: [], databases: [], level: "intermediate" as const };
    const ranked = raw.map(b => ({ bounty: b, analysis: buildAnalysis(b, profile) })).sort((a, b) => Number(Boolean(b.bounty.signals?.rewardVerified)) - Number(Boolean(a.bounty.signals?.rewardVerified)) || Number(b.bounty.reward.amount) - Number(a.bounty.reward.amount) || b.analysis.opportunityScore - a.analysis.opportunityScore);

    const aiEnabled = process.env.OLLAMA_ENABLED !== "false";
    const aiLimitRaw = Number(process.env.OLLAMA_ANALYZE_LIMIT || 3);
    const aiLimit = Math.max(0, Math.min(10, Number.isFinite(aiLimitRaw) ? Math.floor(aiLimitRaw) : 3));
    const aiAnalysis: Record<string, Awaited<ReturnType<typeof analyzeBountyWithOllama>>> = {};
    if (aiEnabled && aiLimit > 0) {
      for (const item of ranked.slice(0, aiLimit)) {
        try { aiAnalysis[item.bounty.id] = await analyzeBountyWithOllama(item.bounty); } catch { /* Local AI failure must not break discovery. */ }
      }
    }

    await Promise.all(ranked.slice(0, 50).map(async x => { const verified = Boolean(x.bounty.signals?.rewardVerified); const confidence = Number(x.bounty.signals?.rewardConfidence || 0); return db.bounty.upsert({ where: { id: x.bounty.id }, update: { title: x.bounty.issue.title, description: x.bounty.issue.description, reward: x.bounty.reward.amount, currency: x.bounty.reward.currency, rewardVerified: verified, rewardConfidence: confidence, rewardSource: x.bounty.signals?.rewardSource || null, status: x.bounty.status, labels: x.bounty.labels, technologies: x.bounty.technologies, updatedAt: new Date(x.bounty.updatedAt) }, create: { id: x.bounty.id, source: x.bounty.source, sourceUrl: x.bounty.sourceUrl, owner: x.bounty.repository.owner, repository: x.bounty.repository.name, issueNumber: x.bounty.issue.number, title: x.bounty.issue.title, description: x.bounty.issue.description, reward: x.bounty.reward.amount, currency: x.bounty.reward.currency, rewardVerified: verified, rewardConfidence: confidence, rewardSource: x.bounty.signals?.rewardSource || null, status: x.bounty.status, labels: x.bounty.labels, technologies: x.bounty.technologies, discoveredAt: new Date(x.bounty.discoveredAt), updatedAt: new Date(x.bounty.updatedAt) } }); }));
    return NextResponse.json({ data: ranked, count: ranked.length, mode, paidOnly, verifiedOnly, verifiedCount: ranked.filter(x => Boolean(x.bounty.signals?.rewardVerified)).length, paidCount: ranked.filter(x => x.bounty.reward.amount > 0).length, ai: { provider: aiEnabled ? "ollama" : "disabled", model: process.env.OLLAMA_MODEL || "qwen2.5-coder:7b", analyzedCount: Object.keys(aiAnalysis).length, analyses: aiAnalysis } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Bounty discovery failed" }, { status: 502 }); }
}
