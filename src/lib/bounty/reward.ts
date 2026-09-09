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

const BOUNTY_CONTEXT = /(?:bounty|reward|prize|payment|paid|tip|funded|award|payout|\/bounty|algora)/i;

export function extractRewards(text: string, source: RewardEvidence["source"] = "issue"): RewardEvidence[] {
  const results: RewardEvidence[] = [];
  for (const { currency, regex } of MONEY_PATTERNS) {
    for (const match of text.matchAll(regex)) {
      const amount = Number(match[1].replace(/,/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const start = Math.max(0, (match.index ?? 0) - 100);
      const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 100);
      const context = text.slice(start, end);
      if (!BOUNTY_CONTEXT.test(context)) continue;
      const confidence = /\/bounty\s+[$€£₹]?\s*[\d,]+/i.test(context) ? 95 : source === "comment" ? 90 : 75;
      results.push({ amount, currency, confidence, source, matchedText: match[0] });
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
  const algora = commentTexts.some((text) => /\/bounty\s+[$€£₹]?\s*[\d,]+/i.test(text));
  const best = all[0] ?? null;
  return {
    paid: Boolean(best),
    amount: best?.amount ?? 0,
    currency: best?.currency ?? "USD",
    confidence: best?.confidence ?? 0,
    source: algora ? "algora" : best?.source ?? "none",
    evidence: all.slice(0, 5),
    verified: Boolean(best && best.confidence >= 90)
  };
}
