import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  defaultOutputFileName,
  resolveCollisionSafeOutput,
  sanitizeOutputFileName
} from "../../src/utils/filename.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (dir) => {
      const { rm } = await import("node:fs/promises");
      await rm(dir, { recursive: true, force: true });
    })
  );
});

describe("sanitizeOutputFileName", () => {
  it("normalizes unsafe characters and forces .mp4 extension", () => {
    expect(sanitizeOutputFileName("..\\unsafe/name.final.mov")).toBe("name.final.mp4");
  });

  it("returns null when output name is missing", () => {
    expect(sanitizeOutputFileName(undefined)).toBeNull();
  });
});

describe("defaultOutputFileName", () => {
  it("creates branded output name", () => {
    expect(defaultOutputFileName("lesson-1.mp4")).toBe("lesson-1-branded.mp4");
  });
});

describe("resolveCollisionSafeOutput", () => {
  it("appends incrementing suffix when file exists", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ffmpeg-automation-"));
    temporaryDirectories.push(dir);

    await writeFile(path.join(dir, "output.mp4"), "existing");

    const resolved = await resolveCollisionSafeOutput(dir, "output.mp4");
    expect(resolved.fileName).toBe("output-1.mp4");
  });
});
