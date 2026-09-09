import { getAIProvider } from "./provider";

export type SolverInput = {
  issueTitle: string;
  issueBody: string;
  repository: string;
  files: { path: string; content: string }[];
  tests?: string;
};

export type SolverResult = {
  summary: string;
  diagnosis: string;
  plan: string[];
  files: { path: string; action: "modify" | "create" | "delete"; content: string; rationale: string }[];
  tests: string[];
  risks: string[];
  confidence: number;
};

export async function solveBounty(input: SolverInput): Promise<SolverResult> {
  const provider = getAIProvider();
  const prompt = `You are the BountyOS coding solver. Analyze a GitHub issue and a bounded repository snapshot. Produce a safe proposed patch, not an execution command. Never invent files that are not needed. Preserve existing architecture. Do not include secrets.\n\nREPOSITORY: ${input.repository}\nISSUE TITLE:\n${input.issueTitle}\nISSUE BODY:\n${input.issueBody}\n\nFILES:\n${input.files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n")}\n\nTEST CONTEXT:\n${input.tests ?? "Not provided"}`;
  const raw = await provider.generate({
    messages: [
      { role: "system", content: "Return ONLY valid JSON matching this shape: {summary:string,diagnosis:string,plan:string[],files:[{path:string,action:\"modify\"|\"create\"|\"delete\",content:string,rationale:string}],tests:string[],risks:string[],confidence:number}. Confidence is 0-100. Do not claim tests were run. The files array contains complete replacement contents for modified/created files and empty content for deleted files." },
      { role: "user", content: prompt }
    ],
    temperature: 0.1,
    maxOutputTokens: 12000,
    json: true
  });
  try {
    const result = JSON.parse(raw) as SolverResult;
    if (!Array.isArray(result.files) || typeof result.confidence !== "number") throw new Error("invalid solver shape");
    return result;
  } catch {
    throw new Error("AI solver returned invalid JSON");
  }
}
