import axios from "axios";

export interface ProofReaderCheck {
  label: string;
  prompt: string;
}

export interface ProofReaderNote {
  label: string;
  note: string;
}

const DEFAULT_MODEL = "gpt-5-nano";
const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "note"],
        properties: {
          label: { type: "string" },
          note: { type: "string" },
        },
      },
    },
  },
};

export function getProofReaderModel(): string {
  const configured = (process.env.OPENAI_MODEL || "").trim();
  return configured || DEFAULT_MODEL;
}

export function buildProofReaderInstruction(mainPrompt: string, checks: ProofReaderCheck[]): string {
  const lines = [
    "You review one graphic design creative.",
    "Answer the main prompt first, then answer each check in the listed order.",
    "Return one result for the main prompt and one result for each check.",
    "Each note is a short written finding about what you see in the image.",
    "",
    "Main prompt:",
    mainPrompt.trim(),
  ];

  if (checks.length) {
    lines.push("", "Checks:");
    checks.forEach((check, index) => {
      lines.push(`${index + 1}. ${check.label}: ${check.prompt}`);
    });
  }

  return lines.join("\n");
}

function unwrapJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() || trimmed;
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };

  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }

  const chunks: string[] = [];
  for (const item of body.output || []) {
    for (const content of item.content || []) {
      if (content?.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("");
}

export function parseProofReaderResponse(payload: unknown): ProofReaderNote[] {
  const text = unwrapJson(extractOutputText(payload));
  if (!text) throw new Error("The model returned an empty review.");

  let parsed: { results?: unknown };
  try {
    parsed = JSON.parse(text) as { results?: unknown };
  } catch {
    throw new Error("The model returned an unexpected review.");
  }

  if (!parsed || !Array.isArray(parsed.results) || parsed.results.length === 0) {
    throw new Error("The model returned an unexpected review.");
  }

  return parsed.results.map(item => {
    if (!item || typeof item !== "object") {
      throw new Error("The model returned an unexpected review.");
    }
    const row = item as { label?: unknown; note?: unknown };
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const note = typeof row.note === "string" ? row.note.trim() : "";
    if (!label || !note) {
      throw new Error("The model returned an incomplete review.");
    }
    return { label: label.slice(0, 200), note };
  });
}

function reviewFailureMessage(error: unknown): string {
  if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
    return "The review took too long. Try again.";
  }
  if (error instanceof Error && error.message.startsWith("The model returned")) {
    return error.message;
  }
  return "The review could not be completed.";
}

export async function reviewCreative(input: {
  imageBuffer: Buffer;
  mimeType: string;
  mainPrompt: string;
  checks: ProofReaderCheck[];
}): Promise<ProofReaderNote[]> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OpenAI is not configured.");
  }

  const dataUrl = `data:${input.mimeType};base64,${input.imageBuffer.toString("base64")}`;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: getProofReaderModel(),
        max_output_tokens: 4000,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildProofReaderInstruction(input.mainPrompt, input.checks),
              },
              {
                type: "input_image",
                image_url: dataUrl,
                detail: "auto",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "proof_reader_results",
            strict: true,
            schema: RESULT_SCHEMA,
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    return parseProofReaderResponse(response.data);
  } catch (error) {
    if (error instanceof Error && error.message === "OpenAI is not configured.") throw error;
    throw new Error(reviewFailureMessage(error));
  }
}
