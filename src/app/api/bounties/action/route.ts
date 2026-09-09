import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bountyId, action } = await req.json();
  if (!bountyId || !["save", "skip", "attempt"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const bounty = await db.bounty.findUnique({ where: { id: bountyId } });
  if (!bounty) return NextResponse.json({ error: "Bounty not found" }, { status: 404 });

  if (action === "save") {
    await db.savedBounty.upsert({
      where: { userId_bountyId: { userId: user.id, bountyId } },
      update: {},
      create: { userId: user.id, bountyId },
    });
    return NextResponse.json({ ok: true, action: "save" });
  }

  if (action === "skip") {
    await db.skippedBounty.upsert({
      where: { userId_bountyId: { userId: user.id, bountyId } },
      update: {},
      create: { userId: user.id, bountyId },
    });
    return NextResponse.json({ ok: true, action: "skip" });
  }

  const existing = await db.attempt.findFirst({
    where: { userId: user.id, bountyId, status: { in: ["planned", "solving"] } },
    orderBy: { updatedAt: "desc" },
  });

  const attempt = existing || await db.attempt.create({
    data: { userId: user.id, bountyId, status: "planned" },
  });

  return NextResponse.json({ ok: true, action: "attempt", attempt });
}
