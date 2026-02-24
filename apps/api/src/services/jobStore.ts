import type { JobStateResponse } from "@ffmpeg-automation/shared";

import { MAX_TERMINAL_JOBS } from "../constants.js";
import { AppError } from "../errors.js";
import type { JobRecord } from "../types.js";

interface CompleteJobPayload {
  outputPath: string;
  outputFileName: string;
  message: string;
}

interface ErrorJobPayload {
  code: string;
  message: string;
}

export class JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly terminalJobIds: string[] = [];

  public createJob(id: string): JobRecord {
    const record: JobRecord = {
      id,
      status: "idle",
      progress: 0,
      message: "Queued",
      outputPath: null,
      outputFileName: null,
      downloadUrl: null,
      errorCode: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null
    };

    this.jobs.set(id, record);
    return record;
  }

  public markRunning(id: string, message: string): void {
    const record = this.getOrThrow(id);
    record.status = "running";
    record.progress = Math.max(record.progress, 0);
    record.message = message;
    record.startedAt ??= Date.now();
  }

  public updateProgress(id: string, progress: number, message: string): void {
    const record = this.getOrThrow(id);
    if (record.status !== "running") {
      return;
    }

    record.progress = Math.max(record.progress, Math.min(99, progress));
    record.message = message;
  }

  public markComplete(id: string, payload: CompleteJobPayload): void {
    const record = this.getOrThrow(id);
    record.status = "complete";
    record.progress = 100;
    record.message = payload.message;
    record.outputPath = payload.outputPath;
    record.outputFileName = payload.outputFileName;
    record.downloadUrl = `/api/v1/jobs/${id}/download`;
    record.errorCode = null;
    record.completedAt = Date.now();
    this.addTerminalJob(id);
  }

  public markError(id: string, payload: ErrorJobPayload): void {
    const record = this.getOrThrow(id);
    record.status = "error";
    record.message = payload.message;
    record.errorCode = payload.code;
    record.completedAt = Date.now();
    this.addTerminalJob(id);
  }

  public get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  public toResponse(id: string): JobStateResponse {
    const record = this.getOrThrow(id);
    return {
      status: record.status,
      progress: record.progress,
      message: record.message,
      downloadUrl: record.downloadUrl,
      outputFileName: record.outputFileName
    };
  }

  private getOrThrow(id: string): JobRecord {
    const record = this.jobs.get(id);
    if (!record) {
      throw new AppError("JOB_NOT_FOUND", "Job not found.", 404);
    }
    return record;
  }

  private addTerminalJob(id: string): void {
    this.terminalJobIds.push(id);
    if (this.terminalJobIds.length <= MAX_TERMINAL_JOBS) {
      return;
    }

    const oldestTerminalId = this.terminalJobIds.shift();
    if (!oldestTerminalId) {
      return;
    }

    const record = this.jobs.get(oldestTerminalId);
    if (!record) {
      return;
    }

    if (record.status === "complete" || record.status === "error") {
      this.jobs.delete(oldestTerminalId);
    }
  }
}
