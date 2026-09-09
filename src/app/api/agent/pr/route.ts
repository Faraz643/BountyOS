import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { GitHubClient } from "@/integrations/github/client";

const ALLOWED = /\.(ts|tsx|js|jsx|py|go|rs|java|kt|rb|php|cs|cpp|c|h|md|json|yaml|yml|toml|sql)$/i;
const BLOCKED = /(^|\/)(\.github|\.git|node_modules|\.env)(\/|$)/i;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { runId, approved } = await req.json();
  if (approved !== true) return NextResponse.json({ error: "Explicit approval is required before repository changes." }, { status: 400 });
  const run = await db.agentRun.findUnique({ where: { id: runId } });
  if (!run || run.userId !== user.id || run.status !== "completed") return NextResponse.json({ error: "Completed solver run not found" }, { status: 404 });
  const bounty = run.bountyId ? await db.bounty.findUnique({ where: { id: run.bountyId } }) : null;
  if (!bounty || !user.githubAccessToken) return NextResponse.json({ error: "Bounty or GitHub authorization missing" }, { status: 400 });
  const output = run.output as any;
  const files = Array.isArray(output?.files) ? output.files.filter((f: any) => f && typeof f.path === "string" && typeof f.content === "string" && ALLOWED.test(f.path) && !BLOCKED.test(f.path) && !f.path.includes("..") && !f.path.startsWith("/")) : [];
  if (!files.length) return NextResponse.json({ error: "Solver produced no safe source files." }, { status: 422 });

  const gh = new GitHubClient(user.githubAccessToken);
  const meta = await gh.repo(bounty.owner, bounty.repository);
  const branch = `bountyos/${bounty.issueNumber}-${Date.now()}`;
  await gh.createBranch(bounty.owner, bounty.repository, branch, meta.default_branch);
  for (const f of files.slice(0, 30)) {
    let sha: string | undefined;
    try { const current = await gh.contents(bounty.owner, bounty.repository, f.path, meta.default_branch); sha = current.sha; } catch { /* new file */ }
    await gh.putFile(bounty.owner, bounty.repository, f.path, f.content, branch, `BountyOS: solve #${bounty.issueNumber}`, sha);
  }
  const pr = await gh.pr(
    bounty.owner, bounty.repository, branch, meta.default_branch,
    `BountyOS: ${bounty.title}`,
    `${output.summary || "AI-generated implementation"}\n\n## BountyOS\n\nAI-generated changes for #${bounty.issueNumber}. Review the diff and CI results before merging.\n\nEstimated confidence: ${output.confidence ?? "unknown"}%\n\nTests suggested by the solver:\n${(output.tests || []).map((x: string) => `- ${x}`).join("\n")}`,
  );
  const record = await db.pullRequest.create({ data: { userId: user.id, bountyId: bounty.id, number: pr.number, url: pr.html_url, githubOwner: bounty.owner, githubRepo: bounty.repository, branch, status: "open" } });
  return NextResponse.json({ pullRequest: record, files: files.map((f: any) => f.path) });
}
