import { describe, expect, it } from "vitest";

import { parseOutTimeMs, toProgressPercent } from "../../src/utils/progress.js";

describe("parseOutTimeMs", () => {
  it("parses valid out_time_ms lines", () => {
    expect(parseOutTimeMs("out_time_ms=500000")).toBe(500000);
  });

  it("returns null for unrelated lines", () => {
    expect(parseOutTimeMs("progress=continue")).toBeNull();
  });
});

describe("toProgressPercent", () => {
  it("converts ffmpeg progress to bounded percentages", () => {
    expect(toProgressPercent(5_000_000, 10)).toBe(50);
    expect(toProgressPercent(12_000_000, 10)).toBe(99);
  });

  it("handles invalid duration", () => {
    expect(toProgressPercent(100, 0)).toBe(0);
  });
});
