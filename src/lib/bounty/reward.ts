const MONEY = /(?:\$|USD\s*)\s*([\d,]+(?:\.\d+)?)/gi;

export function extractRewards(text: string): { amount: number; currency: string }[] {
  const results: { amount: number; currency: string }[] = [];
  for (const match of text.matchAll(MONEY)) {
    const amount = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) results.push({ amount, currency: "USD" });
  }
  return results;
}

export function bestReward(text: string): { amount: number; currency: string } | null {
  return extractRewards(text).sort((a, b) => b.amount - a.amount)[0] ?? null;
}
