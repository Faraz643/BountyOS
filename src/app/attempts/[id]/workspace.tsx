"use client";

import { useEffect, useState } from "react";

type Props = {
  attemptId: string;
  bountyId: string;
  bounty: {
    title: string;
    owner: string;
    repository: string;
    issueNumber: number;
    description: string;
    sourceUrl: string;
    reward: number | null;
    currency: string | null;
  };
};

export default function AttemptWorkspace({ attemptId, bountyId, bounty }: Props) {
  const [status, setStatus] = useState("Starting solver…");
  const [output, setOutput] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function solve() {
      try {
        const response = await fetch("/api/agent/solve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bountyId, attemptId }),
        });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error || "Solver failed");
        setOutput(data.plan);
        setStatus("Analysis complete");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Solver failed");
        setStatus("Solver failed");
      }
    }
    solve();
    return () => { cancelled = true; };
  }, [bountyId, attemptId]);

  return (
    <main className="simple">
      <a href="/">← Dashboard</a>
      <p className="eyebrow">SOLVER WORKSPACE</p>
      <h1>{bounty.title}</h1>
      <p className="muted">{bounty.owner}/{bounty.repository} · #{bounty.issueNumber}</p>
      <div className="notice">Attempt {attemptId.slice(0, 8)} · {status}</div>

      <section className="list" style={{ marginTop: 24 }}>
        <div className="listrow"><b>Issue</b><a href={bounty.sourceUrl} target="_blank" rel="noreferrer">Open on GitHub ↗</a></div>
        <div className="listrow"><b>Reward</b><span>{bounty.reward ? `${bounty.currency || "USD"} ${bounty.reward.toLocaleString()}` : "Not verified"}</span></div>
      </section>

      {error ? <div className="notice" style={{ marginTop: 24 }}>{error}</div> : null}

      <section style={{ marginTop: 32 }}>
        <p className="eyebrow">AI SOLUTION PLAN</p>
        {output ? (
          <pre style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, overflowX: "auto" }}>
            {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
          </pre>
        ) : (
          <div className="empty">Reading the repository and generating a solution plan…</div>
        )}
      </section>
    </main>
  );
}
