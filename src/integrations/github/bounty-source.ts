import type { Bounty, BountySearchFilters, BountySource } from "./types";
import { bestReward } from "@/lib/bounty/reward";

export interface BountySearchFilters { query?: string; minReward?: number; technologies?: string[]; }
export interface BountySource { name: string; search(filters: BountySearchFilters): Promise<Bounty[]>; getBounty(id: string): Promise<Bounty | null>; verify(bounty: Bounty): Promise<import("@/lib/bounty/types").BountyVerification>; }

export class GitHubBountySource implements BountySource {
  name = "github";
  private token = process.env.GITHUB_TOKEN;
  private async request<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
    return res.json();
  }

  async search(filters: BountySearchFilters = {}): Promise<Bounty[]> {
    const terms = ["bounty", "reward", "cash bounty", "paid issue", filters.query].filter(Boolean);
    const query = encodeURIComponent(`${terms.map((x) => `(${x})`).join(" OR ")} is:issue is:open`);
    const data = await this.request<{ items: any[] }>(`https://api.github.com/search/issues?q=${query}&sort=updated&order=desc&per_page=30`);
    return data.items.map((issue) => {
      const reward = bestReward(`${issue.title}\n${issue.body ?? ""}`);
      return {
        id: `github:${issue.repository_url.split("/repos/")[1]}#${issue.number}`,
        source: this.name, sourceUrl: issue.html_url,
        repository: { owner: issue.repository_url.split("/").slice(-2)[0], name: issue.repository_url.split("/").slice(-1)[0], url: issue.repository_url.replace("api.github.com/repos", "github.com") },
        issue: { number: issue.number, url: issue.html_url, title: issue.title, description: issue.body ?? "" },
        reward: reward ?? { amount: 0, currency: "USD" },
        status: "open", labels: (issue.labels ?? []).map((l: any) => l.name), technologies: [],
        discoveredAt: new Date().toISOString(), updatedAt: issue.updated_at
      } satisfies Bounty;
    }).filter((b) => !filters.minReward || b.reward.amount >= filters.minReward);
  }

  async getBounty(id: string): Promise<Bounty | null> {
    const match = id.match(/^github:(.+)#(\d+)$/); if (!match) return null;
    const [owner, repo] = match[1].split("/"); const issue = await this.request<any>(`https://api.github.com/repos/${owner}/${repo}/issues/${match[2]}`);
    const reward = bestReward(`${issue.title}\n${issue.body ?? ""}`);
    return { id, source: this.name, sourceUrl: issue.html_url, repository: { owner, name: repo, url: `https://github.com/${owner}/${repo}` }, issue: { number: issue.number, url: issue.html_url, title: issue.title, description: issue.body ?? "" }, reward: reward ?? { amount: 0, currency: "USD" }, status: issue.state === "open" ? "open" : "completed", labels: (issue.labels ?? []).map((l: any) => l.name), technologies: [], discoveredAt: new Date().toISOString(), updatedAt: issue.updated_at };
  }

  async verify(bounty: Bounty) {
    const reasons: string[] = [];
    const active = bounty.status === "open";
    if (active) reasons.push("Issue is currently open."); else reasons.push("Issue is not open.");
    if (bounty.reward.amount > 0) reasons.push("A monetary reward is explicitly detectable in the issue text."); else reasons.push("No structured monetary reward was detected.");
    const confidence = active && bounty.reward.amount > 0 ? 75 : active ? 45 : 10;
    return { bountyConfidence: confidence, paymentConfidence: bounty.reward.amount > 0 ? 55 : 10, availabilityConfidence: active ? 90 : 5, reasons, verifiedAt: new Date().toISOString() };
  }
}
