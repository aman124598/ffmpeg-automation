import { spawn } from "node:child_process";

import { AppError } from "../errors.js";

interface ProbeResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runFfprobe(args: string[]): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.once("error", (error) => {
      reject(new AppError("MISSING_DEPENDENCY", `Unable to execute ffprobe: ${error.message}`, 503));
    });

    child.once("close", (code) => {
      resolve({
        stdout,
        stderr,
        code: code ?? 1
      });
    });
  });
}

export async function validateMediaReadable(filePath: string): Promise<void> {
  const result = await runFfprobe([
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_type",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath
  ]);

  if (result.code !== 0 || !result.stdout.trim()) {
    throw new AppError("UNREADABLE_MEDIA", "Input file is corrupted or unreadable.", 400);
  }
}

export async function getVideoDurationSeconds(filePath: string): Promise<number> {
  const result = await runFfprobe([
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath
  ]);

  if (result.code !== 0) {
    throw new AppError("UNREADABLE_MEDIA", "Unable to read video metadata.", 400);
  }

  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new AppError("UNREADABLE_MEDIA", "Video duration is invalid.", 400);
  }

  return duration;
}
