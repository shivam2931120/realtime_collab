const baseUrl = () => String(process.env.NVIDIA_API_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");

const apiKey = () => {
  const key = String(process.env.NVIDIA_API_KEY || "").trim();
  if (!key) throw new Error("NVIDIA AI is not configured");
  return key;
};

const request = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`NVIDIA API request failed (${response.status}): ${message.slice(0, 180)}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
};

export const createEmbeddings = async (input: string[], inputType: "query" | "passage") => {
  const model = process.env.NVIDIA_EMBEDDING_MODEL || "nvidia/nv-embedqa-e5-v5";
  const response = await request<{ data?: Array<{ index: number; embedding: number[] }> }>("/embeddings", {
    model,
    input: input.map((item) => item.slice(0, 12_000)),
    input_type: inputType,
    modality: "text",
    encoding_format: "float",
    truncate: "END",
  });
  return (response.data || []).sort((a, b) => a.index - b.index).map((item) => item.embedding);
};

export type WritingAction = "summarize" | "rewrite" | "grammar" | "tone" | "outline" | "actions";

const instructions: Record<WritingAction, string> = {
  summarize: "Create a concise summary that preserves the important facts and decisions.",
  rewrite: "Rewrite for clarity, flow, and professional readability while preserving meaning.",
  grammar: "Correct grammar, spelling, punctuation, and awkward phrasing without changing meaning.",
  tone: "Rewrite using the requested tone while preserving facts and intent.",
  outline: "Turn the material into a useful structured outline with headings and concise bullet points.",
  actions: "Extract concrete action items. Include owner and deadline only when explicitly present; never invent them.",
};

export const runWritingAssistant = async ({
  action,
  text,
  tone,
  context,
}: {
  action: WritingAction;
  text: string;
  tone?: string;
  context?: string;
}) => {
  const model = process.env.NVIDIA_NEMOTRON_MODEL || "nvidia/llama-3.3-nemotron-super-49b-v1.5";
  const response = await request<{ choices?: Array<{ message?: { content?: string } }> }>("/chat/completions", {
    model,
    messages: [
      {
        role: "system",
        content: "You are Editorial's writing assistant. Return only the requested document-ready text. Do not fabricate facts, citations, people, or deadlines.",
      },
      {
        role: "user",
        content: `${instructions[action]}${action === "tone" ? ` Requested tone: ${tone || "professional"}.` : ""}\n\nDocument context:\n${String(context || "").slice(0, 6_000)}\n\nText:\n${text.slice(0, 18_000)}`,
      },
    ],
    temperature: action === "rewrite" || action === "tone" ? 0.35 : 0.1,
    max_tokens: 1600,
    stream: false,
  });
  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Nemotron returned an empty response");
  return { content, model };
};

export const isNvidiaConfigured = () => Boolean(String(process.env.NVIDIA_API_KEY || "").trim());
