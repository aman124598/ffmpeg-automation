import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

import type { ApiError, HealthResponse, ProcessVideoAccepted } from "@ffmpeg-automation/shared";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import multer, { MulterError } from "multer";
import { z } from "zod";

import { DEFAULT_DEV_ORIGIN, MAX_VIDEO_SIZE_BYTES, OUTPUTS_DIR, UPLOADS_DIR } from "./constants.js";
import { AppError } from "./errors.js";
import { JobStore } from "./services/jobStore.js";
import { processVideoJob } from "./services/videoProcessor.js";
import type { DependencyState } from "./types.js";
import { validateLogoFile, validateVideoFile } from "./utils/fileValidation.js";
import { sanitizeOutputFileName } from "./utils/filename.js";
import { removeFileIfPresent } from "./utils/fs.js";

interface CreateAppOptions {
  dependencies: DependencyState;
  jobStore?: JobStore;
}

interface MulterFileMap {
  video?: Express.Multer.File[];
  logo?: Express.Multer.File[];
}

const processVideoBodySchema = z.object({
  outputFileName: z.string().max(120).optional()
});

function createMulterUpload() {
  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, UPLOADS_DIR);
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${randomUUID()}${extension}`);
    }
  });

  return multer({
    storage,
    limits: {
      fileSize: MAX_VIDEO_SIZE_BYTES,
      files: 2
    }
  });
}

function buildCorsConfig(): cors.CorsOptions {
  const isProduction = process.env.NODE_ENV === "production";
  const configuredOrigin = process.env.CORS_ORIGIN;

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (!isProduction && origin === DEFAULT_DEV_ORIGIN) {
        callback(null, true);
        return;
      }

      if (isProduction && configuredOrigin && origin === configuredOrigin) {
        callback(null, true);
        return;
      }

      callback(new AppError("VALIDATION_ERROR", "Origin not allowed by CORS policy.", 403));
    }
  };
}

function toApiError(error: AppError): ApiError {
  return {
    status: "error",
    code: error.code,
    message: error.message,
    ...(error.jobId ? { jobId: error.jobId } : {})
  };
}

async function cleanupFilesFromRequest(files: MulterFileMap | undefined): Promise<void> {
  const videoPath = files?.video?.[0]?.path;
  const logoPath = files?.logo?.[0]?.path;
  await Promise.all([videoPath ? removeFileIfPresent(videoPath) : Promise.resolve(), logoPath ? removeFileIfPresent(logoPath) : Promise.resolve()]);
}

export function createApp(options: CreateAppOptions): express.Express {
  mkdirSync(UPLOADS_DIR, { recursive: true });
  mkdirSync(OUTPUTS_DIR, { recursive: true });

  const app = express();
  const jobStore = options.jobStore ?? new JobStore();
  const upload = createMulterUpload();
  const uploadFields = upload.fields([
    { name: "video", maxCount: 1 },
    { name: "logo", maxCount: 1 }
  ]);

  app.use(helmet());
  app.use(cors(buildCorsConfig()));
  app.use(express.json());

  app.get("/api/v1/health", (_req: Request, res: Response<HealthResponse>) => {
    const isHealthy = options.dependencies.ffmpeg && options.dependencies.ffprobe;
    res.status(200).json({
      status: isHealthy ? "ok" : "degraded",
      ffmpeg: options.dependencies.ffmpeg,
      ffprobe: options.dependencies.ffprobe
    });
  });

  app.post("/api/v1/process-video", uploadFields, async (req: Request, res: Response<ProcessVideoAccepted>, next: NextFunction) => {
    const files = req.files as MulterFileMap | undefined;
    try {
      if (!options.dependencies.ffmpeg || !options.dependencies.ffprobe) {
        throw new AppError("MISSING_DEPENDENCY", "FFmpeg or FFprobe is not available on PATH.", 503);
      }

      const parsedBody = processVideoBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        throw new AppError("VALIDATION_ERROR", "Invalid output filename.", 400);
      }

      const videoFile = files?.video?.[0];
      const logoFile = files?.logo?.[0];

      if (!videoFile || !logoFile) {
        throw new AppError("VALIDATION_ERROR", "Both video and logo files are required.", 400);
      }

      validateVideoFile(videoFile);
      validateLogoFile(logoFile);

      const requestedOutputFileName = sanitizeOutputFileName(parsedBody.data.outputFileName);
      const jobId = randomUUID();
      jobStore.createJob(jobId);

      void processVideoJob({
        jobId,
        jobStore,
        videoPath: videoFile.path,
        logoPath: logoFile.path,
        videoOriginalName: videoFile.originalname,
        requestedOutputFileName
      });

      res.status(202).json({
        status: "accepted",
        jobId,
        message: "Processing started"
      });
    } catch (error) {
      await cleanupFilesFromRequest(files);
      next(error);
    }
  });

  app.get("/api/v1/jobs/:jobId", (req: Request<{ jobId: string }>, res: Response) => {
    const response = jobStore.toResponse(req.params.jobId);
    res.status(200).json(response);
  });

  app.get("/api/v1/jobs/:jobId/download", async (req: Request<{ jobId: string }>, res: Response, next: NextFunction) => {
    try {
      const job = jobStore.get(req.params.jobId);
      if (!job) {
        throw new AppError("JOB_NOT_FOUND", "Job not found.", 404);
      }

      if (job.status !== "complete" || !job.outputPath || !job.outputFileName) {
        throw new AppError("JOB_NOT_COMPLETE", "Job is not complete yet.", 409, job.id);
      }

      res.download(job.outputPath, job.outputFileName, (error) => {
        if (error) {
          next(error);
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, req: Request, res: Response<ApiError>, next: NextFunction) => {
    void next;
    if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        status: "error",
        code: "PAYLOAD_TOO_LARGE",
        message: "Uploaded file exceeds allowed size limit."
      });
      return;
    }

    if (error instanceof AppError) {
      res.status(error.httpStatus).json(toApiError(error));
      return;
    }

    console.error(`[request:${req.method} ${req.path}] unhandled error`, error);
    res.status(500).json({
      status: "error",
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error."
    });
  });

  return app;
}
