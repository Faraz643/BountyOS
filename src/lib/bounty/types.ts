export type BountyStatus = "open" | "claimed" | "in_progress" | "completed" | "unknown";
export type Difficulty = "very_easy" | "easy" | "medium" | "hard" | "very_hard";
export type WorkType = "bug_fix" | "feature" | "refactor" | "documentation" | "performance" | "testing" | "security" | "devops" | "other";
export type Competition = "none" | "low" | "medium" | "high" | "unknown";

export interface Bounty {
  id: string;
  source: string;
  sourceUrl: string;
  repository: { owner: string; name: string; url: string };
  issue: { number: number; url: string; title: string; description: string };
  reward: { amount: number; currency: string; usdEstimate?: number };
  status: BountyStatus;
  labels: string[];
  technologies: string[];
  discoveredAt: string;
  updatedAt: string;
}

export interface BountyVerification {
  bountyConfidence: number;
  paymentConfidence: number;
  availabilityConfidence: number;
  reasons: string[];
  verifiedAt: string;
}

export interface UserSkillProfile {
  languages: string[];
  frameworks: string[];
  databases: string[];
  level: "beginner" | "intermediate" | "advanced" | "expert";
  minimumBounty?: number;
  preferredCurrencies?: string[];
  maxEstimatedHours?: number;
  workTypes?: WorkType[];
}

export interface BountyAnalysis {
  difficulty: Difficulty;
  workType: WorkType;
  issueClarity: number;
  technicalFit: number;
  repositoryHealth: number;
  competition: Competition;
  estimatedHours: { minimum: number; likely: number; maximum: number };
  successProbability: number;
  acceptanceProbability: number;
  opportunityScore: number;
  expectedHourlyReturn: { minimum: number; maximum: number };
  reasons: string[];
  risks: string[];
}
