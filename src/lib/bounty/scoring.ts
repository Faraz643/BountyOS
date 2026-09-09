import type { Bounty, BountyAnalysis, UserSkillProfile } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function technicalFit(bounty: Bounty, profile: UserSkillProfile): number {
  const required = new Set(bounty.technologies.map((x) => x.toLowerCase()));
  if (!required.size) return 60;
  const skills = new Set([...profile.languages, ...profile.frameworks, ...profile.databases].map((x) => x.toLowerCase()));
  const matches = [...required].filter((x) => skills.has(x)).length;
  const base = (matches / required.size) * 100;
  const levelBonus = { beginner: 0, intermediate: 3, advanced: 7, expert: 10 }[profile.level];
  return clamp(base + (matches ? levelBonus : 0));
}

export function opportunityScore(bounty: Bounty, analysis: Omit<BountyAnalysis, "opportunityScore" | "expectedHourlyReturn">): number {
  const reward = bounty.reward.usdEstimate ?? bounty.reward.amount;
  const effort = Math.max(analysis.estimatedHours.likely, 0.5);
  const returnScore = clamp((reward / effort) / 10);
  const competitionPenalty = { none: 0, low: 5, medium: 15, high: 30, unknown: 12 }[analysis.competition];
  return clamp(
    analysis.technicalFit * 0.22 +
    analysis.issueClarity * 0.14 +
    analysis.repositoryHealth * 0.10 +
    analysis.successProbability * 0.22 +
    analysis.acceptanceProbability * 0.17 +
    returnScore * 0.15 - competitionPenalty
  );
}

export function buildAnalysis(bounty: Bounty, profile: UserSkillProfile): BountyAnalysis {
  const fit = technicalFit(bounty, profile);
  const clarity = bounty.issue.description.trim().length > 180 ? 82 : bounty.issue.description.trim().length > 60 ? 68 : 45;
  const difficulty = bounty.labels.some((l) => /good first issue|beginner|easy/i.test(l)) ? "easy" : "medium";
  const hours = difficulty === "easy" ? { minimum: 1, likely: 3, maximum: 6 } : { minimum: 3, likely: 7, maximum: 14 };
  const success = clamp(fit * 0.55 + clarity * 0.25 + 65 * 0.2);
  const acceptance = clamp(clarity * 0.45 + 65 * 0.35 + (fit * 0.2));
  const analysisBase = {
    difficulty,
    workType: "other" as const,
    issueClarity: clarity,
    technicalFit: fit,
    repositoryHealth: 65,
    competition: "unknown" as const,
    estimatedHours: hours,
    successProbability: success,
    acceptanceProbability: acceptance,
    reasons: [fit >= 80 ? "Strong technical fit" : "Technical fit needs review", clarity >= 75 ? "Issue has useful detail" : "Acceptance criteria may be unclear"],
    risks: ["Estimates are probabilistic and should be validated before starting."]
  };
  const score = opportunityScore(bounty, analysisBase);
  const reward = bounty.reward.usdEstimate ?? bounty.reward.amount;
  return { ...analysisBase, opportunityScore: score, expectedHourlyReturn: { minimum: Math.round(reward / hours.maximum), maximum: Math.round(reward / hours.minimum) } };
}
