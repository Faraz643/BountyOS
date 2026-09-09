import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { GitHubClient } from "@/integrations/github/client";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || !u.githubAccessToken) return NextResponse.json({ error: "GitHub authorization required" }, { status: 401 });
  const { pullRequestId, approved } = await req.json();
  if (approved !== true) return NextResponse.json({ error: "Explicit approval required before tests run." }, { status: 400 });
  const pr = await db.pullRequest.findUnique({ where: { id: pullRequestId } });
  if (!pr || pr.userId !== u.id) return NextResponse.json({ error: "PR not found" }, { status: 404 });
  const gh = new GitHubClient(u.githubAccessToken);
  try {
    await gh.request(`/repos/${pr.githubOwner}/${pr.githubRepo}/actions/workflows/bountyos-sandbox.yml/dispatches`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: pr.branch, inputs: { branch: pr.branch } }),
    });
    return NextResponse.json({ ok: true, message: "Sandbox test workflow dispatched.", branch: pr.branch });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not dispatch sandbox tests";
    if (message.includes("GitHub 403") || message.includes("GitHub 404")) {
      return NextResponse.json({ error: "GitHub Actions dispatch is not permitted for this token. The pull request's normal CI workflow will still run automatically." }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || !u.githubAccessToken) return NextResponse.json({ error: "GitHub authorization required" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("pullRequestId");
  if (!id) return NextResponse.json({ error: "pullRequestId is required" }, { status: 400 });
  const pr = await db.pullRequest.findUnique({ where: { id } });
  if (!pr || pr.userId !== u.id) return NextResponse.json({ error: "PR not found" }, { status: 404 });
  const gh = new GitHubClient(u.githubAccessToken);
  try {
    const data = await gh.request<any>(`/repos/${pr.githubOwner}/${pr.githubRepo}/actions/workflows/bountyos-sandbox.yml/runs?branch=${encodeURIComponent(pr.branch)}&per_page=5`);
    return NextResponse.json({ runs: (data.workflow_runs || []).map((r: any) => ({ id: r.id, status: r.status, conclusion: r.conclusion, url: r.html_url, createdAt: r.created_at, updatedAt: r.updated_at })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read test status" }, { status: 502 });
  }
}
