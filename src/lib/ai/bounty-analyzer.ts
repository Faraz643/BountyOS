import type { Bounty } from "@/lib/bounty/types";
import { ollamaGenerate } from "./ollama";

export interface AiBountyAnalysis {
  summary: string;
  implementationPlan: string[];
  keyRisks: string[];
  requiredSkills: string[];
  difficulty: "very_easy" | "easy" | "medium" | "hard" | "very_hard";
  estimatedHours: { minimum: number; likely: number; maximum: number };
  acceptanceLikelihood: number;
  worthPursuing: boolean;
  confidence: number;
}

const fallback: AiBountyAnalysis = {
  summary: "AI analysis unavailable.",
  implementationPlan: [],
  keyRisks: [],
  requiredSkills: [],
  difficulty: "medium",
  estimatedHours: { minimum: 0, likely: 0, maximum: 0 },
  acceptanceLikelihood: 0,
  worthPursuing: false,
  confidence: 0,
};

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

function normalize(data: Partial<AiBountyAnalysis>): AiBountyAnalysis {
  const difficulties = ["very_easy", "easy", "medium", "hard", "very_hard"] as const;
  const difficulty = difficulties.includes(data.difficulty as any) ? data.difficulty! : "medium";
  const hours = data.estimatedHours || {};
  return {
    summary: typeof data.summary === "string" ? data.summary.slice(0, 1000) : fallback.summary,
    implementationPlan: Array.isArray(data.implementationPlan) ? data.implementationPlan.filter(x => typeof x === "string").slice(0, 8) : [],
    keyRisks: Array.isArray(data.keyRisks) ? data.keyRisks.filter(x => typeof x === "string").slice(0, 8) : [],
    requiredSkills: Array.isArray(data.requiredSkills) ? data.requiredSkills.filter(x => typeof x === "string").slice(0, 12) : [],
    difficulty: difficulty as AiBountyAnalysis["difficulty"],
    estimatedHours: {
      minimum: Math.max(0, Number(hours.minimum) || 0),
      likely: Math.max(0, Number(hours.likely) || 0),
      maximum: Math.max(0, Number(hours.maximum) || 0),
    },
    acceptanceLikelihood: Math.max(0, Math.min(100, Math.round(Number(data.acceptanceLikelihood) || 0))),
    worthPursuing: Boolean(data.worthPursuing),
    confidence: Math.max(0, Math.min(100, Math.round(Number(data.confidence) || 0))),
  };
}

export async function analyzeBountyWithOllama(bounty: Bounty): Promise<AiBountyAnalysis> {
  const prompt = `You are a senior open-source engineer evaluating a GitHub bounty. Analyze ONLY the information provided below. Do not invent payment, repository facts, or requirements. Return ONLY valid JSON matching this schema exactly: {"summary":"string","implementationPlan":["string"],"keyRisks":["string"],"requiredSkills":["string"],"difficulty":"very_easy|easy|medium|hard|very_hard","estimatedHours":{"minimum":number,"likely":number,"maximum":number},"acceptanceLikelihood":number,"worthPursuing":boolean,"confidence":number}. acceptanceLikelihood and confidence are 0-100. worthPursuing should consider reward, effort, clarity and competition.\n\nRepository: ${bounty.repository.owner}/${bounty.repository.name}\nIssue #${bounty.issue.number}: ${bounty.issue.title}\nReward: ${bounty.reward.amount} ${bounty.reward.currency}${bounty.reward.usdEstimate != null ? ` (USD estimate ${bounty.reward.usdEstimate})` : ""}\nLabels: ${bounty.labels.join(", ") || "none"}\nTechnologies detected: ${bounty.technologies.join(", ") || "none"}\nComments: ${bounty.signals?.comments ?? 0}; reactions: ${bounty.signals?.reactions ?? 0}; assignees: ${bounty.signals?.assignees ?? 0}; linked PR: ${bounty.signals?.hasLinkedPullRequest ? "yes" : "no"}\n\nIssue description:\n${bounty.issue.description.slice(0, 12000)}`;

  const result = await ollamaGenerate({ prompt });
  try {
    return normalize(JSON.parse(extractJson(result.response)) as Partial<AiBountyAnalysis>);
  } catch {
    return { ...fallback, summary: result.response.slice(0, 1000), confidence: 10 };
  }
}
