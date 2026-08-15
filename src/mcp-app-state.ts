export function shouldReplayHostToolOutput(hasActiveView: boolean, toolOutput: unknown): boolean {
  return !hasActiveView && toolOutput !== undefined;
}
