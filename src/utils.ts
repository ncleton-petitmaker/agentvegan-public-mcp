import { PublicDataError } from "./errors.js";

export function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

export function clampLimit(value: number | undefined): number {
  if (value === undefined) return 20;
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new PublicDataError("INVALID_ARGUMENT", "limit doit être un entier compris entre 1 et 50.", 400);
  }
  return value;
}

export function encodeCursor(offset: number, datasetVersion: string): string {
  return btoa(JSON.stringify({ o: offset, v: datasetVersion }));
}

export function decodeCursor(cursor: string | undefined, datasetVersion: string): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(atob(cursor)) as { o?: unknown; v?: unknown };
    if (!Number.isInteger(parsed.o) || (parsed.o as number) < 0 || parsed.v !== datasetVersion) throw new Error("invalid");
    return parsed.o as number;
  } catch {
    throw new PublicDataError("INVALID_ARGUMENT", "Curseur invalide ou associé à une autre version du catalogue.", 400);
  }
}

export function paginate<T>(items: T[], offset: number, limit: number, datasetVersion: string): { items: T[]; nextCursor: string | null } {
  const slice = items.slice(offset, offset + limit);
  return {
    items: slice,
    nextCursor: offset + limit < items.length ? encodeCursor(offset + limit, datasetVersion) : null,
  };
}

export function parseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new PublicDataError("DATASET_UNAVAILABLE", "Une ligne D1 contient un document JSON invalide.", 503);
  }
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
