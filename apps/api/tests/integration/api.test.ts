import path from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { OUTPUTS_DIR } from "../../src/constants.js";
import { JobStore } from "../../src/services/jobStore.js";

async function runCommand(binary: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        stdout,
        stderr,
        code: code ?? 1
      });
    });
  });
}

async function runCommandBuffer(binary: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const chunks: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if ((code ?? 1) !== 0) {
        reject(new Error(`Command failed: ${binary} ${args.join(" ")}\n${stderr}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

async function binaryAvailable(binary: string): Promise<boolean> {
  try {
    const result = await runCommand(binary, ["-version"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

const ffmpegAvailable = await binaryAvailable("ffmpeg");
const ffprobeAvailable = await binaryAvailable("ffprobe");
const describeIfMediaTools = ffmpegAvailable && ffprobeAvailable ? describe : describe.skip;

describeIfMediaTools("API integration", () => {
  const dependencies = { ffmpeg: true, ffprobe: true };
  const jobStore = new JobStore();
  const app = createApp({ dependencies, jobStore });
  const client = request(app);

  let fixtureDir = "";
  let inputVideoPath = "";
  let logoPath = "";
  let corruptedVideoPath = "";
  let unsupportedFilePath = "";

  beforeAll(async () => {
    fixtureDir = await mkdtemp(path.join(tmpdir(), "ffmpeg-automation-"));
    inputVideoPath = path.join(fixtureDir, "input.mp4");
    logoPath = path.join(fixtureDir, "logo.png");
    corruptedVideoPath = path.join(fixtureDir, "corrupt.mp4");
    unsupportedFilePath = path.join(fixtureDir, "sample.txt");

    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x240:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=2",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      inputVideoPath
    ]);

    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=100x50",
      "-frames:v",
      "1",
      logoPath
    ]);

    await writeFile(corruptedVideoPath, "not-a-real-video");
    await writeFile(unsupportedFilePath, "unsupported");
  });

  beforeEach(async () => {
    const files = await readdir(OUTPUTS_DIR);
    await Promise.all(
      files
        .filter((fileName) => fileName !== ".gitkeep")
        .map((fileName) => rm(path.join(OUTPUTS_DIR, fileName), { force: true }))
    );
  });

  afterAll(async () => {
    if (fixtureDir) {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  async function waitForTerminalState(jobId: string): Promise<{ status: string; outputFileName: string | null; progress: number }> {
    const timeoutAt = Date.now() + 40_000;
    while (Date.now() < timeoutAt) {
      const statusResponse = await client.get(`/api/v1/jobs/${jobId}`);
      if (statusResponse.status === 200 && (statusResponse.body.status === "complete" || statusResponse.body.status === "error")) {
        return statusResponse.body as { status: string; outputFileName: string | null; progress: number };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`Timed out waiting for terminal job state (${jobId})`);
  }

  it("processes a valid request and generates a downloadable no-audio output", async () => {
    const accepted = await client
      .post("/api/v1/process-video")
      .field("outputFileName", "branded-output.mp4")
      .attach("video", inputVideoPath)
      .attach("logo", logoPath);

    expect(accepted.status).toBe(202);
    expect(accepted.body.status).toBe("accepted");

    const terminal = await waitForTerminalState(accepted.body.jobId);
    expect(terminal.status).toBe("complete");
    expect(terminal.progress).toBe(100);
    expect(terminal.outputFileName).toBe("branded-output.mp4");

    const finalPath = path.join(OUTPUTS_DIR, terminal.outputFileName ?? "");
    const noAudioProbe = await runCommand("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      finalPath
    ]);
    expect(noAudioProbe.stdout.trim()).toBe("");

    const pixel = await runCommandBuffer("ffmpeg", [
      "-v",
      "error",
      "-i",
      finalPath,
      "-vf",
      "format=rgb24,crop=1:1:250:25",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "pipe:1"
    ]);

    expect(pixel.length).toBeGreaterThanOrEqual(3);
    const red = pixel.at(0);
    const blue = pixel.at(2);
    expect(red).toBeTypeOf("number");
    expect(blue).toBeTypeOf("number");
    if (red === undefined || blue === undefined) {
      throw new Error("Failed to sample output pixel");
    }
    expect(red).toBeGreaterThan(blue);
  });

  it("returns validation error when files are missing", async () => {
    const response = await client.post("/api/v1/process-video");
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns validation error for unsupported format", async () => {
    const response = await client
      .post("/api/v1/process-video")
      .attach("video", unsupportedFilePath, { contentType: "text/plain" })
      .attach("logo", logoPath);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns payload error for oversized logo", async () => {
    const oversizedBuffer = Buffer.alloc(21 * 1024 * 1024, 1);

    const response = await client
      .post("/api/v1/process-video")
      .attach("video", inputVideoPath)
      .attach("logo", oversizedBuffer, { filename: "logo.png", contentType: "image/png" });

    expect(response.status).toBe(413);
    expect(response.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("marks job as error when media is corrupted", async () => {
    const accepted = await client
      .post("/api/v1/process-video")
      .attach("video", corruptedVideoPath, { contentType: "video/mp4" })
      .attach("logo", logoPath);

    expect(accepted.status).toBe(202);
    const terminal = await waitForTerminalState(accepted.body.jobId);
    expect(terminal.status).toBe("error");
  });

  it("avoids output overwrite by appending numeric suffix", async () => {
    await writeFile(path.join(OUTPUTS_DIR, "conflict.mp4"), "existing");

    const accepted = await client
      .post("/api/v1/process-video")
      .field("outputFileName", "conflict.mp4")
      .attach("video", inputVideoPath)
      .attach("logo", logoPath);

    expect(accepted.status).toBe(202);
    const terminal = await waitForTerminalState(accepted.body.jobId);
    expect(terminal.status).toBe("complete");
    expect(terminal.outputFileName).toBe("conflict-1.mp4");
  });

  it("returns 409 for download when job is not complete", async () => {
    const manualJobId = "manual-test-job";
    jobStore.createJob(manualJobId);

    const response = await client.get(`/api/v1/jobs/${manualJobId}/download`);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("JOB_NOT_COMPLETE");
  });
});
