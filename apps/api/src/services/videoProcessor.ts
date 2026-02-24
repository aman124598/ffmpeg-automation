import { spawn } from "node:child_process";

import { OUTPUTS_DIR, PROCESS_TIMEOUT_MS } from "../constants.js";
import { AppError } from "../errors.js";
import { JobStore } from "./jobStore.js";
import { defaultOutputFileName, resolveCollisionSafeOutput } from "../utils/filename.js";
import { removeFileIfPresent } from "../utils/fs.js";
import { getVideoDurationSeconds, validateMediaReadable } from "../utils/ffprobe.js";
import { parseOutTimeMs, toProgressPercent } from "../utils/progress.js";

interface ProcessJobInput {
  jobId: string;
  videoPath: string;
  logoPath: string;
  videoOriginalName: string;
  requestedOutputFileName: string | null;
  jobStore: JobStore;
}

function buildFfmpegArgs(videoPath: string, logoPath: string, outputPath: string): string[] {
  const filterGraph = "[0:v][1:v]overlay=main_w-overlay_w-20:20[outv]";

  return [
    "-hide_banner",
    "-n",
    "-i",
    videoPath,
    "-i",
    logoPath,
    "-filter_complex",
    filterGraph,
    "-map",
    "[outv]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath
  ];
}

async function runFfmpegWithProgress(
  args: string[],
  durationSeconds: number,
  onProgress: (value: number) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let timedOut = false;
    let stdoutBuffer = "";
    let stderr = "";

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, PROCESS_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");

      const lines = stdoutBuffer.split(/\r?\n/u);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const parsed = parseOutTimeMs(line);
        if (parsed === null) {
          continue;
        }
        onProgress(toProgressPercent(parsed, durationSeconds));
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 8_000) {
        stderr = stderr.slice(-8_000);
      }
    });

    child.once("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(new AppError("MISSING_DEPENDENCY", `Unable to run ffmpeg: ${error.message}`, 503));
    });

    child.once("close", (code) => {
      clearTimeout(timeoutHandle);
      if (timedOut) {
        reject(new AppError("PROCESS_TIMEOUT", "Video processing exceeded timeout.", 504));
        return;
      }

      if (code !== 0) {
        const details = stderr.trim().split(/\r?\n/u).slice(-3).join(" ");
        reject(new AppError("FFMPEG_EXECUTION_FAILED", `FFmpeg failed: ${details}`, 500));
        return;
      }

      resolve();
    });
  });
}

export async function processVideoJob(input: ProcessJobInput): Promise<void> {
  const startTime = Date.now();
  const { jobId, jobStore } = input;

  let outputFileName = "";
  let outputPath = "";

  try {
    jobStore.markRunning(jobId, "Validating media");

    await validateMediaReadable(input.videoPath);
    await validateMediaReadable(input.logoPath);

    const durationSeconds = await getVideoDurationSeconds(input.videoPath);

    const requestedName = input.requestedOutputFileName ?? defaultOutputFileName(input.videoOriginalName);
    const safeOutput = await resolveCollisionSafeOutput(OUTPUTS_DIR, requestedName);
    outputFileName = safeOutput.fileName;
    outputPath = safeOutput.fullPath;

    jobStore.markRunning(jobId, "Processing video");
    await runFfmpegWithProgress(buildFfmpegArgs(input.videoPath, input.logoPath, outputPath), durationSeconds, (progress) => {
      jobStore.updateProgress(jobId, progress, "Processing video");
    });

    jobStore.markComplete(jobId, {
      outputPath,
      outputFileName,
      message: "Video generated"
    });

    const elapsedMs = Date.now() - startTime;
    console.info(
      `[job:${jobId}] success inputVideo=${input.videoOriginalName} outputFile=${outputFileName} durationMs=${elapsedMs}`
    );
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("FFMPEG_EXECUTION_FAILED", "Unexpected processing failure.", 500);

    jobStore.markError(jobId, {
      code: appError.code,
      message: appError.message
    });

    const elapsedMs = Date.now() - startTime;
    console.error(
      `[job:${jobId}] failure code=${appError.code} message=${appError.message} outputFile=${outputFileName || "n/a"} durationMs=${elapsedMs}`
    );

    await removeFileIfPresent(outputPath);
  } finally {
    await Promise.all([removeFileIfPresent(input.videoPath), removeFileIfPresent(input.logoPath)]);
  }
}
