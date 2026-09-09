import type { Bounty, BountyVerification } from "@/lib/bounty/types";
import { bestReward } from "@/lib/bounty/reward";

export interface BountySearchFilters { query?: string; minReward?: number; technologies?: string[]; }
export interface BountySource { name: string; search(filters: BountySearchFilters): Promise<Bounty[]>; getBounty(id: string): Promise<Bounty | null>; verify(bounty: Bounty): Promise<BountyVerification>; }

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
      const parts = issue.repository_url.split("/"); const owner = parts.at(-2)!; const name = parts.at(-1)!;
      const reward = bestReward(`${issue.title}\n${issue.body ?? ""}`);
      return { id: `github:${owner}/${name}#${issue.number}`, source: this.name, sourceUrl: issue.html_url, repository: { owner, name, url: `https://github.com/${owner}/${name}` }, issue: { number: issue.number, url: issue.html_url, title: issue.title, description: issue.body ?? "" }, reward: reward ?? { amount: 0, currency: "USD" }, status: "open", labels: (issue.labels ?? []).map((l: any) => l.name), technologies: [], discoveredAt: new Date().toISOString(), updatedAt: issue.updated_at } satisfies Bounty;
    }).filter((b) => !filters.minReward || b.reward.amount >= filters.minReward);
  }
  async getBounty(id: string): Promise<Bounty | null> {
    const match = id.match(/^github:(.+)#(\d+)$/); if (!match) return null;
    const [owner, repo] = match[1].split("/"); const issue = await this.request<any>(`https://api.github.com/repos/${owner}/${repo}/issues/${match[2]}`);
    const reward = bestReward(`${issue.title}\n${issue.body ?? ""}`);
    return { id, source: this.name, sourceUrl: issue.html_url, repository: { owner, name: repo, url: `https://github.com/${owner}/${repo}` }, issue: { number: issue.number, url: issue.html_url, title: issue.title, description: issue.body ?? "" }, reward: reward ?? { amount: 0, currency: "USD" }, status: issue.state === "open" ? "open" : "completed", labels: (issue.labels ?? []).map((l: any) => l.name), technologies: [], discoveredAt: new Date().toISOString(), updatedAt: issue.updated_at };
  }
  async verify(bounty: Bounty): Promise<BountyVerification> {
    const active = bounty.status === "open";
    const reasons = [active ? "Issue is currently open." : "Issue is not open.", bounty.reward.amount > 0 ? "A monetary reward is explicitly detectable in the issue text." : "No structured monetary reward was detected."];
    return { bountyConfidence: active && bounty.reward.amount > 0 ? 75 : active ? 45 : 10, paymentConfidence: bounty.reward.amount > 0 ? 55 : 10, availabilityConfidence: active ? 90 : 5, reasons, verifiedAt: new Date().toISOString() };
  }
}
