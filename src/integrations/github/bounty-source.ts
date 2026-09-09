import type { Bounty, BountyVerification } from "@/lib/bounty/types";
import { bestReward } from "@/lib/bounty/reward";

export interface BountySearchFilters { query?: string; minReward?: number; technologies?: string[]; }
export interface BountySource { name: string; search(filters: BountySearchFilters): Promise<Bounty[]>; getBounty(id: string): Promise<Bounty | null>; verify(bounty: Bounty): Promise<BountyVerification>; }

const TECHNOLOGIES = [
  "typescript", "javascript", "python", "java", "go", "rust", "c++", "c#", "php", "ruby", "swift", "kotlin",
  "react", "next.js", "nextjs", "node.js", "node", "express", "vue", "angular", "svelte", "django", "flask",
  "fastapi", "spring", "rails", "laravel", "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite",
  "docker", "kubernetes", "terraform", "aws", "gcp", "azure", "graphql", "rest", "github actions"
];

function detectTechnologies(text: string, labels: string[]): string[] {
  const haystack = `${text} ${labels.join(" ")}`.toLowerCase();
  return [...new Set(TECHNOLOGIES.filter((technology) => {
    const needle = technology.toLowerCase();
    const index = haystack.indexOf(needle);
    if (index < 0) return false;
    const before = haystack[index - 1] ?? " ";
    const after = haystack[index + needle.length] ?? " ";
    return !/[a-z0-9]/i.test(before) || !/[a-z0-9]/i.test(after);
  }))];
}

function mapIssue(issue: any, owner: string, name: string): Bounty {
  const labels = (issue.labels ?? []).map((l: any) => typeof l === "string" ? l : l.name).filter(Boolean);
  const description = issue.body ?? "";
  const reward = bestReward(`${issue.title}\n${description}`);
  return {
    id: `github:${owner}/${name}#${issue.number}`,
    source: "github",
    sourceUrl: issue.html_url,
    repository: { owner, name, url: `https://github.com/${owner}/${name}` },
    issue: { number: issue.number, url: issue.html_url, title: issue.title, description },
    reward: reward ?? { amount: 0, currency: "USD" },
    status: "open",
    labels,
    technologies: detectTechnologies(`${issue.title}\n${description}`, labels),
    discoveredAt: new Date().toISOString(),
    updatedAt: issue.updated_at,
    signals: {
      comments: Number(issue.comments ?? 0),
      reactions: Number(issue.reactions?.total_count ?? 0),
      assignees: Array.isArray(issue.assignees) ? issue.assignees.length : 0,
      hasLinkedPullRequest: Boolean(issue.pull_request?.html_url),
      createdAt: issue.created_at
    }
  };
}

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
      const parts = issue.repository_url.split("/");
      const owner = parts.at(-2)!;
      const name = parts.at(-1)!;
      return mapIssue(issue, owner, name);
    }).filter((b) => !filters.minReward || b.reward.amount >= filters.minReward).filter((b) => !filters.technologies?.length || filters.technologies.some((t) => b.technologies.map((x) => x.toLowerCase()).includes(t.toLowerCase())));
  }
  async getBounty(id: string): Promise<Bounty | null> {
    const match = id.match(/^github:(.+)#(\d+)$/); if (!match) return null;
    const [owner, repo] = match[1].split("/");
    const issue = await this.request<any>(`https://api.github.com/repos/${owner}/${repo}/issues/${match[2]}`);
    const bounty = mapIssue(issue, owner, repo);
    return { ...bounty, status: issue.state === "open" ? "open" : "completed" };
  }
  async verify(bounty: Bounty): Promise<BountyVerification> {
    const active = bounty.status === "open";
    const paid = bounty.reward.amount > 0;
    const reasons = [active ? "Issue is currently open." : "Issue is not open.", paid ? "A monetary reward is explicitly detectable in the issue text." : "No structured monetary reward was detected."];
    return { bountyConfidence: active && paid ? 80 : active ? 45 : 10, paymentConfidence: paid ? 60 : 10, availabilityConfidence: active ? 90 : 5, reasons, verifiedAt: new Date().toISOString() };
  }
}
