export function parseOutTimeMs(progressLine: string): number | null {
  if (!progressLine.startsWith("out_time_ms=")) {
    return null;
  }

  const rawValue = progressLine.slice("out_time_ms=".length).trim();
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function toProgressPercent(outTimeMs: number, durationSeconds: number): number {
  if (durationSeconds <= 0) {
    return 0;
  }

  const estimated = Math.floor((outTimeMs / (durationSeconds * 1_000_000)) * 100);
  if (estimated < 0) {
    return 0;
  }
  if (estimated > 99) {
    return 99;
  }
  return estimated;
}
