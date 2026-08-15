export type PublicDataErrorCode =
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "AMBIGUOUS_INGREDIENT"
  | "UNSUPPORTED_BASIS"
  | "DATASET_STALE"
  | "DATASET_UNAVAILABLE"
  | "RATE_LIMITED";

export class PublicDataError extends Error {
  readonly code: PublicDataErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: PublicDataErrorCode, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "PublicDataError";
    this.code = code;
    this.status = status;
    if (details) this.details = details;
  }
}

export function errorPayload(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof PublicDataError) {
    return {
      status: error.status,
      body: {
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }
  return {
    status: 503,
    body: {
      error: "DATASET_UNAVAILABLE",
      message: "Le catalogue public est momentanément indisponible. Réessayez plus tard ou consultez /api/v1/status.",
    },
  };
}
