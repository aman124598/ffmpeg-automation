export type JobStatus = "idle" | "running" | "complete" | "error";

export interface ProcessVideoAccepted {
  status: "accepted";
  jobId: string;
  message: string;
}

export interface JobStateResponse {
  status: JobStatus;
  progress: number;
  message: string;
  downloadUrl: string | null;
  outputFileName: string | null;
}

export interface ApiError {
  status: "error";
  code: string;
  message: string;
  jobId?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  ffmpeg: boolean;
  ffprobe: boolean;
}
