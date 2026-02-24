import { useEffect, useMemo, useState } from "react";
import type { ApiError, JobStateResponse, ProcessVideoAccepted } from "@ffmpeg-automation/shared";
import { Analytics } from "@vercel/analytics/react";

const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".avi"];
const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"];
const MAX_VIDEO_UPLOAD_BYTES = 95 * 1024 * 1024;
const MAX_LOGO_UPLOAD_BYTES = 20 * 1024 * 1024;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

function fileHasAllowedExtension(file: File, allowedExtensions: string[]): boolean {
  const lowerCaseName = file.name.toLowerCase();
  return allowedExtensions.some((extension) => lowerCaseName.endsWith(extension));
}

function buildApiUrl(path: string): string {
  if (/^https?:\/\//u.test(path)) {
    return path;
  }
  if (!apiBaseUrl) {
    return path;
  }
  return `${apiBaseUrl}${path}`;
}

type UiStatus = "idle" | "running" | "complete" | "error";

const initialMessage = "Choose a video and logo to generate a branded output.";

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [outputFileName, setOutputFileName] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<UiStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(initialMessage);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [outputName, setOutputName] = useState<string | null>(null);

  const isRunning = status === "running";
  const isComplete = status === "complete";
  const statusClassName = `status status--${status}`;

  const inputValidationMessage = useMemo(() => {
    if (!videoFile || !logoFile) {
      return "Video and logo are required.";
    }

    if (!fileHasAllowedExtension(videoFile, ALLOWED_VIDEO_EXTENSIONS)) {
      return "Video format must be .mp4, .mov, .mkv, or .avi.";
    }

    if (!fileHasAllowedExtension(logoFile, ALLOWED_IMAGE_EXTENSIONS)) {
      return "Logo format must be .png, .jpg, or .jpeg.";
    }

    if (videoFile.size > MAX_VIDEO_UPLOAD_BYTES) {
      return "Video is too large for hosted upload. Use a file smaller than 95MB.";
    }

    if (logoFile.size > MAX_LOGO_UPLOAD_BYTES) {
      return "Logo is too large. Use a file smaller than 20MB.";
    }

    return "";
  }, [videoFile, logoFile]);

  const canGenerate = !isRunning && inputValidationMessage === "";

  useEffect(() => {
    if (!jobId || !isRunning) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(buildApiUrl(`/api/v1/jobs/${jobId}`));
        const payload = (await response.json()) as JobStateResponse | ApiError;

        if (!response.ok) {
          setStatus("error");
          setMessage("Failed to fetch job status.");
          return;
        }

        const jobState = payload as JobStateResponse;
        setProgress(jobState.progress);
        setMessage(jobState.message);
        setDownloadUrl(jobState.downloadUrl);
        setOutputName(jobState.outputFileName);

        if (jobState.status === "complete") {
          setStatus("complete");
          window.clearInterval(interval);
        } else if (jobState.status === "error") {
          setStatus("error");
          window.clearInterval(interval);
        }
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Unable to poll job status.");
        window.clearInterval(interval);
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [jobId, isRunning]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!videoFile || !logoFile) {
      setStatus("error");
      setMessage("Please select both video and logo files.");
      return;
    }

    if (inputValidationMessage) {
      setStatus("error");
      setMessage(inputValidationMessage);
      return;
    }

    setStatus("running");
    setProgress(0);
    setMessage("Uploading files...");
    setDownloadUrl(null);
    setOutputName(null);

    const formData = new FormData();
    formData.append("video", videoFile);
    formData.append("logo", logoFile);
    if (outputFileName.trim()) {
      formData.append("outputFileName", outputFileName.trim());
    }

    try {
      const response = await fetch(buildApiUrl("/api/v1/process-video"), {
        method: "POST",
        body: formData
      });

      let payload: ProcessVideoAccepted | ApiError | null = null;
      try {
        payload = (await response.json()) as ProcessVideoAccepted | ApiError;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        if (response.status === 413) {
          setStatus("error");
          setMessage("Upload too large. Reduce file size and try again.");
          return;
        }
        const errorPayload = payload as ApiError | null;
        setStatus("error");
        setMessage(errorPayload?.message ?? `Request failed with status ${response.status}.`);
        return;
      }

      if (!payload || !("jobId" in payload)) {
        setStatus("error");
        setMessage("Unexpected success response from server.");
        return;
      }

      const accepted = payload as ProcessVideoAccepted;
      setJobId(accepted.jobId);
      setMessage("Processing started");
      setStatus("running");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Request failed.");
    }
  }

  function resetForNewInput() {
    if (status !== "idle") {
      setStatus("idle");
      setProgress(0);
      setMessage(initialMessage);
      setJobId(null);
      setDownloadUrl(null);
      setOutputName(null);
    }
  }

  return (
    <main className="page">
      <section className="panel">
        <p className="eyebrow">Branding Studio</p>
        <h1>Video Logo Overlay Tool</h1>
        <p className="subtitle">Upload a video and logo, then generate a branded output with one click.</p>

        <form onSubmit={handleSubmit} className="form" aria-describedby="status-message">
          <div className="field">
            <label htmlFor="videoFile">Video File</label>
            <input
              id="videoFile"
              type="file"
              accept=".mp4,.mov,.mkv,.avi"
              disabled={isRunning}
              onChange={(event) => {
                setVideoFile(event.target.files?.[0] ?? null);
                resetForNewInput();
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="logoFile">Logo Image</label>
            <input
              id="logoFile"
              type="file"
              accept=".png,.jpg,.jpeg"
              disabled={isRunning}
              onChange={(event) => {
                setLogoFile(event.target.files?.[0] ?? null);
                resetForNewInput();
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="outputFileName">Output File Name (Optional)</label>
            <input
              id="outputFileName"
              type="text"
              placeholder="example-branded.mp4"
              disabled={isRunning}
              value={outputFileName}
              onChange={(event) => {
                setOutputFileName(event.target.value);
                resetForNewInput();
              }}
            />
          </div>

          <button className="primary-action" type="submit" disabled={!canGenerate}>
            {isRunning ? "Processing..." : "Generate Video"}
          </button>
        </form>

        <section className={statusClassName} aria-live="polite" id="status-message">
          <div className="status-head">
            <p className="status-line">
              <strong>Status:</strong>{" "}
              <span className={`status-pill status-pill--${status}`}>{status}</span>
            </p>
            <p className="status-value">{progress}%</p>
          </div>
          <p className="status-line status-line--message">
            <strong>Message:</strong> {message}
          </p>
          <progress max={100} value={progress} aria-label="Processing progress" />
        </section>

        {isComplete && downloadUrl ? (
          <a className="download" href={buildApiUrl(downloadUrl)}>
            Download {outputName ?? "Output Video"}
          </a>
        ) : null}
      </section>
      <Analytics />
    </main>
  );
}
