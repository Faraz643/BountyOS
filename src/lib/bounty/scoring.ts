import type { Bounty, BountyAnalysis, UserSkillProfile } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const text = (bounty: Bounty) => `${bounty.issue.title}\n${bounty.issue.description}`.toLowerCase();

export function technicalFit(bounty: Bounty, profile: UserSkillProfile): number {
  const required = new Set(bounty.technologies.map((x) => x.toLowerCase()));
  if (!required.size) return 55;
  const skills = new Set([...profile.languages, ...profile.frameworks, ...profile.databases].map((x) => x.toLowerCase()));
  const matches = [...required].filter((x) => skills.has(x)).length;
  const base = (matches / required.size) * 100;
  const levelBonus = { beginner: 0, intermediate: 3, advanced: 6, expert: 9 }[profile.level];
  return clamp(base + (matches ? levelBonus : 0));
}

function issueClarity(bounty: Bounty): number {
  const body = bounty.issue.description.trim();
  const t = text(bounty);
  let score = body.length >= 500 ? 78 : body.length >= 250 ? 68 : body.length >= 100 ? 57 : 42;
  if (/(acceptance criteria|expected behavior|steps to reproduce|reproduction|definition of done)/i.test(t)) score += 12;
  if (/\b(todo|tbd|help wanted|ideas?)\b/i.test(t)) score -= 8;
  return clamp(score);
}

function difficultyAndHours(bounty: Bounty): { difficulty: BountyAnalysis["difficulty"]; hours: BountyAnalysis["estimatedHours"] } {
  const t = text(bounty);
  const labels = bounty.labels.join(" ").toLowerCase();
  if (/(good first issue|first-timers-only|beginner|easy|documentation|typo)/i.test(labels + " " + t)) {
    return { difficulty: "easy", hours: { minimum: 1, likely: 3, maximum: 6 } };
  }
  let complexity = 45;
  if (/(security|authentication|authorization|migration|concurrency|race condition|distributed|architecture|breaking change)/i.test(t)) complexity += 25;
  if (/(performance|optimi[sz]|memory leak|deadlock|compiler|parser|protocol)/i.test(t)) complexity += 15;
  if (/(refactor|rewrite|redesign|multiple modules|end-to-end)/i.test(t)) complexity += 15;
  if (/(bug|fix|crash|error|regression)/i.test(t)) complexity -= 5;
  if (bounty.signals?.assignees) complexity += 5;
  if (complexity < 45) return { difficulty: "easy", hours: { minimum: 1, likely: 3, maximum: 6 } };
  if (complexity < 70) return { difficulty: "medium", hours: { minimum: 3, likely: 7, maximum: 14 } };
  if (complexity < 88) return { difficulty: "hard", hours: { minimum: 8, likely: 18, maximum: 32 } };
  return { difficulty: "very_hard", hours: { minimum: 16, likely: 30, maximum: 60 } };
}

function workType(bounty: Bounty): BountyAnalysis["workType"] {
  const t = text(bounty);
  if (/security|vulnerability|exploit|cve|auth bypass/i.test(t)) return "security";
  if (/performance|slow|latency|optimi[sz]|memory leak/i.test(t)) return "performance";
  if (/test|testing|coverage|spec/i.test(t)) return "testing";
  if (/documentation|docs|readme|guide/i.test(t)) return "documentation";
  if (/deploy|deployment|ci\/cd|github actions|docker|kubernetes|terraform/i.test(t)) return "devops";
  if (/refactor|cleanup|technical debt/i.test(t)) return "refactor";
  if (/feature|add support|implement|introduce/i.test(t)) return "feature";
  if (/bug|fix|crash|regression|error/i.test(t)) return "bug_fix";
  return "other";
}

function competition(bounty: Bounty): BountyAnalysis["competition"] {
  const s = bounty.signals;
  if (!s) return "unknown";
  const pressure = s.assignees * 4 + Math.min(s.comments, 20) + (s.hasLinkedPullRequest ? 20 : 0);
  if (pressure === 0) return "none";
  if (pressure <= 8) return "low";
  if (pressure <= 25) return "medium";
  return "high";
}

function repositoryHealth(bounty: Bounty): number {
  const s = bounty.signals;
  if (!s) return 60;
  let score = 62;
  if (s.comments >= 2) score += 5;
  if (s.comments >= 10) score += 5;
  if (s.reactions >= 3) score += 4;
  if (s.reactions >= 10) score += 4;
  if (s.hasLinkedPullRequest) score += 5;
  return clamp(score);
}

export function opportunityScore(bounty: Bounty, analysis: Omit<BountyAnalysis, "opportunityScore" | "expectedHourlyReturn">): number {
  const reward = bounty.reward.usdEstimate ?? bounty.reward.amount;
  const effort = Math.max(analysis.estimatedHours.likely, 0.5);
  const hourly = reward / effort;
  const returnScore = reward > 0 ? clamp(Math.log10(1 + hourly) * 25) : 0;
  const competitionPenalty = { none: 0, low: 3, medium: 9, high: 18, unknown: 6 }[analysis.competition];
  const rewardPenalty = reward <= 0 ? 20 : 0;
  return clamp(
    analysis.technicalFit * 0.24 +
    analysis.issueClarity * 0.14 +
    analysis.repositoryHealth * 0.08 +
    analysis.successProbability * 0.22 +
    analysis.acceptanceProbability * 0.17 +
    returnScore * 0.15 - competitionPenalty - rewardPenalty
  );
}

export function buildAnalysis(bounty: Bounty, profile: UserSkillProfile): BountyAnalysis {
  const fit = technicalFit(bounty, profile);
  const clarity = issueClarity(bounty);
  const { difficulty, hours } = difficultyAndHours(bounty);
  const type = workType(bounty);
  const comp = competition(bounty);
  const health = repositoryHealth(bounty);
  const success = clamp(fit * 0.5 + clarity * 0.25 + health * 0.15 + (comp === "high" ? 2 : 10));
  const acceptance = clamp(clarity * 0.5 + fit * 0.25 + health * 0.15 + (comp === "high" ? 0 : 8));
  const analysisBase = {
    difficulty,
    workType: type,
    issueClarity: clarity,
    technicalFit: fit,
    repositoryHealth: health,
    competition: comp,
    estimatedHours: hours,
    successProbability: success,
    acceptanceProbability: acceptance,
    reasons: [
      fit >= 80 ? "Strong technical fit" : fit >= 55 ? "Partial technical fit" : "Technical fit needs review",
      clarity >= 75 ? "Issue has strong implementation detail" : clarity >= 55 ? "Issue has usable implementation detail" : "Issue requirements may need clarification",
      bounty.reward.amount > 0 ? "A monetary reward was detected" : "No verified monetary reward detected"
    ],
    risks: [
      ...(comp === "high" ? ["Signs of high competition or active work detected."] : []),
      ...(clarity < 55 ? ["Requirements appear underspecified."] : []),
      ...(bounty.reward.amount <= 0 ? ["No monetary reward is currently verified."] : []),
      "Estimates are probabilistic and should be validated before starting."
    ]
  };
  const score = opportunityScore(bounty, analysisBase);
  const reward = bounty.reward.usdEstimate ?? bounty.reward.amount;
  return {
    ...analysisBase,
    opportunityScore: score,
    expectedHourlyReturn: {
      minimum: reward > 0 ? Math.round(reward / hours.maximum) : 0,
      maximum: reward > 0 ? Math.round(reward / hours.minimum) : 0
    }
  };
}
