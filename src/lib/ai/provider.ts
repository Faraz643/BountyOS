export type AIMessage = { role: "system" | "user" | "assistant"; content: string };

export type AIRequest = {
  messages: AIMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  json?: boolean;
};

export interface AIProvider {
  readonly name: string;
  generate(request: AIRequest): Promise<string>;
}

export class AIProviderError extends Error {
  constructor(message: string, public readonly provider: string, public readonly status?: number) {
    super(message);
    this.name = "AIProviderError";
  }
}

export function getAIProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  if (provider === "gemini") return new GeminiProvider();
  if (provider === "ollama") return new OllamaProvider();
  throw new AIProviderError(`Unsupported AI_PROVIDER: ${provider}`, provider);
}

class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private apiKey = process.env.GEMINI_API_KEY ?? process.env.AI_API_KEY;
  private model = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";

  async generate(request: AIRequest): Promise<string> {
    if (!this.apiKey) throw new AIProviderError("GEMINI_API_KEY is not configured", this.name);
    const contents = request.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const system = request.messages.find((m) => m.role === "system")?.content;
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxOutputTokens ?? 8192,
        ...(request.json ? { responseMimeType: "application/json" } : {})
      }
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    if (!response.ok) throw new AIProviderError(`Gemini request failed: ${response.status} ${response.statusText}`, this.name, response.status);
    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
    if (!text) throw new AIProviderError("Gemini returned no text", this.name);
    return text;
  }
}

class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  private baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  private model = process.env.OLLAMA_MODEL ?? "qwen3-coder";

  async generate(request: AIRequest): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, stream: false, messages: request.messages, options: { temperature: request.temperature ?? 0.2 } })
    });
    if (!response.ok) throw new AIProviderError(`Ollama request failed: ${response.status}`, this.name, response.status);
    const data = await response.json() as any;
    return data.message?.content ?? "";
  }
}
