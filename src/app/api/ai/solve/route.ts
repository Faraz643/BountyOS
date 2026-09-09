import { NextResponse } from "next/server";
import { solveBounty } from "@/lib/ai/solver";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.issueTitle || !body?.repository || !Array.isArray(body?.files)) {
      return NextResponse.json({ error: "issueTitle, repository and files are required" }, { status: 400 });
    }
    if (body.files.length > 80) return NextResponse.json({ error: "Repository snapshot is too large; provide a bounded relevant file set." }, { status: 413 });
    const result = await solveBounty({ issueTitle: body.issueTitle, issueBody: body.issueBody ?? "", repository: body.repository, files: body.files, tests: body.tests });
    return NextResponse.json({ provider: process.env.AI_PROVIDER ?? "gemini", result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI solver failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
