export interface ToolResultLike {
  structuredContent?: unknown;
  content?: unknown;
}

function parseJsonObject(value: string): unknown | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * MCP hosts are expected to preserve `structuredContent`, but some ChatGPT
 * bridge versions currently return the same canonical JSON only through the
 * text content block for UI-initiated tool calls. Both representations are
 * emitted by our server and contain the identical public response envelope.
 */
export function toolResultPayloadCandidates(result: ToolResultLike): unknown[] {
  const candidates: unknown[] = [];
  if (result.structuredContent !== undefined) {
    candidates.push(result.structuredContent);
    if (typeof result.structuredContent === "string") {
      const parsed = parseJsonObject(result.structuredContent);
      if (parsed !== null) candidates.push(parsed);
    }
  }

  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (!block || typeof block !== "object") continue;
      const record = block as Record<string, unknown>;
      if (record.type !== "text" || typeof record.text !== "string") continue;
      const parsed = parseJsonObject(record.text);
      if (parsed !== null) candidates.push(parsed);
    }
  }
  return candidates;
}
