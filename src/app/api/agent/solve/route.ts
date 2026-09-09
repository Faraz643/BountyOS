import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { GitHubClient } from "@/integrations/github/client";
import { CompatibleAIProvider } from "@/integrations/ai/provider";

const SOURCE_EXT = /\.(ts|tsx|js|jsx|py|go|rs|java|kt|rb|php|cs|cpp|c|h|md|json|yaml|yml|toml|sql)$/i;
const MANIFEST = /(^|\/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|pyproject\.toml|requirements\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle|Gemfile|composer\.json|README\.md)$/i;

function keywords(text: string) {
  const stop = new Set(["the","and","for","with","this","that","issue","when","from","into","should","would","could","have","will","there","then","also","not","are","was","but","use","using"]);
  return [...new Set((text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || []).filter(x => !stop.has(x)))];
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { bountyId, attemptId, force } = await req.json();
  const bounty = await db.bounty.findUnique({ where: { id: bountyId } });
  if (!bounty) return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
  if (!user.githubAccessToken) return NextResponse.json({ error: "Reconnect GitHub to enable solver." }, { status: 401 });

  let attempt = null;
  if (attemptId) {
    attempt = await db.attempt.findFirst({ where: { id: attemptId, userId: user.id, bountyId } });
    if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    const existing = !force ? await db.agentRun.findFirst({ where: { userId: user.id, bountyId, type: "coding", status: "completed", inputSummary: `${bounty.owner}/${bounty.repository}#${bounty.issueNumber}` }, orderBy: { createdAt: "desc" } }) : null;
    if (existing?.output) {
      await db.attempt.update({ where: { id: attempt.id }, data: { status: "solution_ready" } });
      return NextResponse.json({ runId: existing.id, plan: existing.output, reused: true });
    }
    await db.attempt.update({ where: { id: attempt.id }, data: { status: "solving" } });
  }

  const run = await db.agentRun.create({ data: {
    userId: user.id, bountyId, type: "coding", status: "running",
    provider: process.env.AI_PROVIDER || "gemini",
    model: process.env.GEMINI_MODEL || process.env.AI_MODEL || "gemini-3.7-flash",
    startedAt: new Date(), inputSummary: `${bounty.owner}/${bounty.repository}#${bounty.issueNumber}`,
  }});

  try {
    const gh = new GitHubClient(user.githubAccessToken);
    const [meta, issue, comments] = await Promise.all([
      gh.repo(bounty.owner, bounty.repository),
      gh.issue(bounty.owner, bounty.repository, bounty.issueNumber),
      gh.comments(bounty.owner, bounty.repository, bounty.issueNumber),
    ]);
    const tree = await gh.tree(bounty.owner, bounty.repository, meta.default_branch);
    const issueText = `${issue.title || bounty.title}\n${issue.body || bounty.description || ""}`;
    const keys = keywords(issueText);
    const allPaths = (tree.tree || []).filter((x: any) => x.type === "blob" && SOURCE_EXT.test(x.path));
    const rankedPaths = allPaths.map((x: any) => {
      const p = x.path.toLowerCase();
      const score = (MANIFEST.test(x.path) ? 100 : 0) + keys.reduce((n, k) => n + (p.includes(k) ? 12 : 0), 0) - p.split("/").length;
      return { path: x.path, score };
    }).sort((a: any, b: any) => b.score - a.score);
    const paths = [...new Set([
      ...allPaths.filter((x: any) => MANIFEST.test(x.path)).map((x: any) => x.path),
      ...rankedPaths.slice(0, 14).map((x: any) => x.path),
    ])].slice(0, 18);

    const files: { path: string; content: string }[] = [];
    for (const path of paths) {
      try {
        const c = await gh.contents(bounty.owner, bounty.repository, path, meta.default_branch);
        if (c.content && typeof c.content === "string") files.push({ path, content: Buffer.from(c.content, "base64").toString("utf8").slice(0, 14000) });
      } catch { /* continue with files that are readable */ }
    }

    const skills = (user.skills || []).map((s: any) => `${s.category}:${s.name} (${s.level})`).join(", ") || "No skills profile configured";
    const discussion = (comments || []).slice(-30).map((c: any) => `${c.user?.login || "user"}: ${c.body || ""}`).join("\n---\n").slice(0, 18000);
    const issuePayload = [
      `ISSUE: ${issue.title || bounty.title}`,
      `URL: ${bounty.sourceUrl}`,
      `BODY:\n${issue.body || bounty.description || ""}`,
      `LABELS: ${(issue.labels || []).map((x: any) => x.name || x).join(", ")}`,
      `ASSIGNEES: ${(issue.assignees || []).map((x: any) => x.login).join(", ")}`,
      `DISCUSSION:\n${discussion || "No comments"}`,
      `USER SKILLS: ${skills}`,
      `REPOSITORY: ${bounty.owner}/${bounty.repository}`,
      `DEFAULT BRANCH: ${meta.default_branch}`,
    ].join("\n\n");

    const ai = new CompatibleAIProvider();
    const result = await ai.generatePatch({ issue: issuePayload, repo: `${bounty.owner}/${bounty.repository} @ ${meta.default_branch}`, files: files.map(f => `===== ${f.path} =====\n${f.content}`) });
    const output = { ...result, context: { filesRead: files.map(f => f.path), repository: `${bounty.owner}/${bounty.repository}`, branch: meta.default_branch } };
    await db.agentRun.update({ where: { id: run.id }, data: { status: "completed", output, confidence: result.confidence ?? 60, finishedAt: new Date() } });
    if (attempt) await db.attempt.update({ where: { id: attempt.id }, data: { status: result.files.length ? "solution_ready" : "blocked" } });
    return NextResponse.json({ runId: run.id, plan: output, context: output.context });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Solver failed";
    await db.agentRun.update({ where: { id: run.id }, data: { status: "failed", error: message, finishedAt: new Date() } });
    if (attempt) await db.attempt.update({ where: { id: attempt.id }, data: { status: "failed" } });
    return NextResponse.json({ error: message, runId: run.id }, { status: 502 });
  }
}
