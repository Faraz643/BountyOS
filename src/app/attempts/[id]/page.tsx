import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import AttemptWorkspace from "./workspace";

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/github");

  const attempt = await db.attempt.findFirst({
    where: { id, userId: user.id },
    include: { bounty: true },
  });

  if (!attempt) notFound();

  return (
    <AttemptWorkspace
      attemptId={attempt.id}
      bountyId={attempt.bountyId}
      bounty={{
        title: attempt.bounty.title,
        owner: attempt.bounty.owner,
        repository: attempt.bounty.repository,
        issueNumber: attempt.bounty.issueNumber,
        description: attempt.bounty.description,
        sourceUrl: attempt.bounty.sourceUrl,
        reward: attempt.bounty.reward,
        currency: attempt.bounty.currency,
      }}
    />
  );
}
