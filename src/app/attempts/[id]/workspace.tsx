"use client";

import { useEffect, useState } from "react";

type Props = { attemptId: string; bountyId: string; bounty: { title: string; owner: string; repository: string; issueNumber: number; description: string; sourceUrl: string; reward: number | null; currency: string | null } };
type Plan = { summary?: string; plan?: string; diagnosis?: string; files?: { path: string; content: string; action?: string; rationale?: string }[]; tests?: string[]; risks?: string[]; confidence?: number };

export default function AttemptWorkspace({ attemptId, bountyId, bounty }: Props) {
  const [status, setStatus] = useState("Starting AI solver…");
  const [output, setOutput] = useState<Plan | null>(null);
  const [runId, setRunId] = useState("");
  const [error, setError] = useState("");
  const [pr, setPr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [runs, setRuns] = useState<any[]>([]);
  const [review, setReview] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/agent/solve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bountyId, attemptId }) });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error || "Solver failed");
        setRunId(data.runId || ""); setOutput(data.plan || null);
        setStatus(data.plan?.files?.length ? "Solution ready for review" : "AI could not safely produce a patch");
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : "Solver failed"); setStatus("Solver failed"); } }
    })();
    return () => { cancelled = true; };
  }, [bountyId, attemptId]);

  async function createPR() {
    if (!runId || !output?.files?.length) return;
    if (!window.confirm("Create a GitHub branch and pull request containing these AI-generated changes? Review the files first.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/agent/pr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, approved: true }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not create pull request");
      setPr(data.pullRequest); setStatus("Pull request created; CI can now run");
    } catch (e) { setError(e instanceof Error ? e.message : "PR creation failed"); } finally { setBusy(false); }
  }

  async function runSandbox() {
    if (!pr?.id) return;
    if (!window.confirm("Run the BountyOS sandbox tests for this branch?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/agent/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pullRequestId: pr.id, approved: true }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not start tests");
      setTestMessage(data.message || "Sandbox tests dispatched."); setStatus("Tests running on GitHub Actions");
    } catch (e) { setError(e instanceof Error ? e.message : "Test dispatch failed"); } finally { setBusy(false); }
  }

  async function refreshTests() {
    if (!pr?.id) return;
    try { const response = await fetch(`/api/agent/test?pullRequestId=${encodeURIComponent(pr.id)}`, { cache: "no-store" }); const data = await response.json(); if (response.ok) setRuns(data.runs || []); } catch { /* status is optional */ }
  }

  async function reviewPR() {
    if (!pr?.id) return;
    setBusy(true); setError("");
    try { const response = await fetch("/api/agent/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pullRequestId: pr.id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Review failed"); setReview(data.result); setStatus("AI code review complete"); } catch (e) { setError(e instanceof Error ? e.message : "Review failed"); } finally { setBusy(false); }
  }

  useEffect(() => { if (!pr?.id) return; refreshTests(); const timer = window.setInterval(refreshTests, 10000); return () => window.clearInterval(timer); }, [pr?.id]);

  return <main className="simple">
    <a href="/">← Dashboard</a>
    <p className="eyebrow">SOLVER WORKSPACE</p>
    <h1>{bounty.title}</h1>
    <p className="muted">{bounty.owner}/{bounty.repository} · #{bounty.issueNumber}</p>
    <div className="notice">Attempt {attemptId.slice(0, 8)} · {status}</div>

    <section className="list" style={{ marginTop: 24 }}>
      <div className="listrow"><b>Issue</b><a href={bounty.sourceUrl} target="_blank" rel="noreferrer">Open on GitHub ↗</a></div>
      <div className="listrow"><b>Reward</b><span>{bounty.reward ? `${bounty.currency || "USD"} ${bounty.reward.toLocaleString()}` : "Not verified"}</span></div>
      {output?.confidence != null && <div className="listrow"><b>AI confidence</b><span>{output.confidence}%</span></div>}
      {output?.files && <div className="listrow"><b>Proposed files</b><span>{output.files.length}</span></div>}
    </section>

    {error && <div className="notice" style={{ marginTop: 24 }}>{error}</div>}
    {testMessage && <div className="notice" style={{ marginTop: 24 }}>{testMessage}</div>}

    {output && <>
      <section style={{ marginTop: 32 }}><p className="eyebrow">DIAGNOSIS</p><p className="muted" style={{ whiteSpace: "pre-wrap" }}>{output.diagnosis || "The solver analyzed the issue and repository snapshot."}</p></section>
      <section style={{ marginTop: 28 }}><p className="eyebrow">AI SOLUTION</p><h2>{output.summary || "Proposed implementation"}</h2><p className="muted" style={{ whiteSpace: "pre-wrap" }}>{Array.isArray(output.plan) ? output.plan.join("\n") : output.plan || ""}</p></section>
      <section style={{ marginTop: 28 }}><p className="eyebrow">CHANGED FILES</p><div className="list">{(output.files || []).map(f => <details className="listrow" key={f.path}><summary><b>{f.action || "modify"} · {f.path}</b>{f.rationale ? <span> — {f.rationale}</span> : null}</summary><pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", marginTop: 12 }}>{f.content}</pre></details>)}</div></section>
      <section style={{ marginTop: 28 }}><p className="eyebrow">TEST PLAN</p><ul>{(output.tests || []).map((t, i) => <li key={i}>{t}</li>)}</ul></section>
      {(output.risks || []).length > 0 && <section style={{ marginTop: 28 }}><p className="eyebrow">RISKS</p><ul>{output.risks!.map((r, i) => <li key={i}>{r}</li>)}</ul></section>}
      {!pr && <button disabled={busy || !output.files?.length} onClick={createPR} style={{ marginTop: 28 }}>{busy ? "Creating…" : "Approve changes & create PR"}</button>}
    </>}

    {pr && <section style={{ marginTop: 32 }}><p className="eyebrow">PULL REQUEST</p><div className="list"><div className="listrow"><b>Branch</b><span>{pr.branch}</span></div><div className="listrow"><b>Status</b><span>{pr.status}</span></div><div className="listrow"><a href={pr.url} target="_blank" rel="noreferrer">Open pull request ↗</a></div></div><div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}><button disabled={busy} onClick={runSandbox}>{busy ? "Working…" : "Run sandbox tests"}</button><button disabled={busy} onClick={reviewPR}>{busy ? "Working…" : "AI review PR"}</button></div></section>}

    {pr && <section style={{ marginTop: 28 }}><p className="eyebrow">CI STATUS</p>{runs.length ? <div className="list">{runs.map(r => <a className="listrow" href={r.url} target="_blank" rel="noreferrer" key={r.id}><b>{r.status}</b><span>{r.conclusion || "in progress"}</span></a>)}</div> : <div className="empty">No sandbox run found yet. GitHub Actions may still be starting.</div>}</section>}

    {review && <section style={{ marginTop: 28 }}><p className="eyebrow">AI REVIEW</p><div className="list"><div className="listrow"><b>Verdict</b><span>{review.verdict || "needs_human_review"}</span></div><div className="listrow"><b>Summary</b><span>{review.summary || ""}</span></div></div>{(review.blockingIssues || []).length > 0 && <><h3 style={{ marginTop: 18 }}>Blocking issues</h3><ul>{review.blockingIssues.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}{(review.suggestedChanges || []).length > 0 && <><h3 style={{ marginTop: 18 }}>Suggested changes</h3><ul>{review.suggestedChanges.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}</section>}
  </main>;
}
