import type { JobStatus } from "@ffmpeg-automation/shared";

export interface DependencyState {
  ffmpeg: boolean;
  ffprobe: boolean;
}

export interface JobRecord {
  id: string;
  status: JobStatus;
  progress: number;
  message: string;
  outputPath: string | null;
  outputFileName: string | null;
  downloadUrl: string | null;
  errorCode: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
}
