export interface OllamaGenerateOptions {
  model?: string;
  prompt: string;
  temperature?: number;
}

export interface OllamaGenerateResult {
  response: string;
  done?: boolean;
}

const baseUrl = () => (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
const model = () => process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";

export async function isOllamaEnabled(): Promise<boolean> {
  return process.env.OLLAMA_ENABLED !== "false";
}

export async function ollamaGenerate(options: OllamaGenerateOptions): Promise<OllamaGenerateResult> {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 120000);

  try {
    const response = await fetch(`${baseUrl()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model || model(),
        prompt: options.prompt,
        stream: false,
        options: { temperature: options.temperature ?? 0.1 },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Ollama API error ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    }

    const data = (await response.json()) as OllamaGenerateResult;
    if (typeof data.response !== "string") throw new Error("Ollama returned an invalid response");
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
