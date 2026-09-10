export type RewardEvidence = {
  amount: number;
  currency: string;
  confidence: number;
  source: "issue" | "comment" | "platform";
  matchedText: string;
};

const MONEY_PATTERNS: Array<{ currency: string; regex: RegExp }> = [
  { currency: "USD", regex: /(?:\$|USD\s*)\s*([\d,]+(?:\.\d+)?)/gi },
  { currency: "EUR", regex: /(?:€|EUR\s*)\s*([\d,]+(?:\.\d+)?)/gi },
  { currency: "GBP", regex: /(?:£|GBP\s*)\s*([\d,]+(?:\.\d+)?)/gi },
  { currency: "INR", regex: /(?:₹|INR\s*)\s*([\d,]+(?:\.\d+)?)/gi },
  { currency: "CAD", regex: /(?:CAD\s*)\$?\s*([\d,]+(?:\.\d+)?)/gi },
  { currency: "AUD", regex: /(?:AUD\s*)\$?\s*([\d,]+(?:\.\d+)?)/gi }
];

const EXPLICIT_BOUNTY = /(?:\/bounty\s+|\b(?:bounty|reward|prize)\s*(?:is|:|of|worth)?\s*)(?:[$€£₹]|USD\s*|EUR\s*|GBP\s*|INR\s*|CAD\s*|AUD\s*)?[\d,]+(?:\.\d+)?/i;
const ALGORA = /(?:algora\.io|algora\b).*?(?:\/bounty|bounty|reward)|(?:\/bounty\s+[$€£₹]?\s*[\d,]+)/i;
const MONEY_CONTEXT = /\b(?:bounty|reward|prize|payment|paid|tip|funded|award|payout)\b/i;
const NEGATIVE_CONTEXT = /\b(?:no|not|unpaid|unfunded|cancel+ed|expired|closed|removed|withdrawn)\s+(?:bounty|reward|payment|funding)\b/i;

export function extractRewards(text: string, source: RewardEvidence["source"] = "issue"): RewardEvidence[] {
  const results: RewardEvidence[] = [];
  for (const { currency, regex } of MONEY_PATTERNS) {
    for (const match of text.matchAll(regex)) {
      const amount = Number(match[1].replace(/,/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const start = Math.max(0, (match.index ?? 0) - 140);
      const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 140);
      const context = text.slice(start, end);
      if (!MONEY_CONTEXT.test(context) || NEGATIVE_CONTEXT.test(context)) continue;
      const explicit = EXPLICIT_BOUNTY.test(context);
      const platform = ALGORA.test(context);
      const confidence = platform ? 100 : explicit && source === "comment" ? 98 : explicit ? 95 : 70;
      results.push({ amount, currency, confidence, source: platform ? "platform" : source, matchedText: match[0] });
    }
  }
  return results;
}

export function bestReward(text: string, source: RewardEvidence["source"] = "issue"): { amount: number; currency: string } | null {
  const best = extractRewards(text, source).sort((a, b) => b.confidence - a.confidence || b.amount - a.amount)[0];
  return best ? { amount: best.amount, currency: best.currency } : null;
}

export function verifyRewardEvidence(issueText: string, commentTexts: string[] = []) {
  const issue = extractRewards(issueText, "issue");
  const comments = commentTexts.flatMap((text) => extractRewards(text, "comment"));
  const all = [...issue, ...comments].sort((a, b) => b.confidence - a.confidence || b.amount - a.amount);
  const best = all[0] ?? null;
  const explicitPlatform = all.find((e) => e.source === "platform" && e.confidence >= 95);
  const explicit = all.find((e) => e.confidence >= 95);
  const verifiedEvidence = explicitPlatform ?? explicit ?? null;
  return {
    paid: Boolean(best),
    amount: verifiedEvidence?.amount ?? best?.amount ?? 0,
    currency: verifiedEvidence?.currency ?? best?.currency ?? "USD",
    confidence: verifiedEvidence?.confidence ?? best?.confidence ?? 0,
    source: verifiedEvidence?.source ?? best?.source ?? "none",
    evidence: all.slice(0, 5),
    verified: Boolean(verifiedEvidence)
  };
}
