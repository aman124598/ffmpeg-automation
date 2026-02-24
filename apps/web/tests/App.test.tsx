import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";

function createFile(name: string, type: string): File {
  return new File(["content"], name, { type });
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

describe("App", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("enables generate button only when valid files are selected", async () => {
    render(<App />);
    const user = userEvent.setup();

    const generateButton = screen.getByRole("button", { name: /generate video/i });
    expect(generateButton).toBeDisabled();

    const videoInput = screen.getByLabelText(/video file/i);
    const logoInput = screen.getByLabelText(/logo image/i);

    await user.upload(videoInput, createFile("input.mp4", "video/mp4"));
    await user.upload(logoInput, createFile("logo.png", "image/png"));

    expect(generateButton).toBeEnabled();
  });

  it("shows running progress and then complete state with download link", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ status: "accepted", jobId: "job-1", message: "Processing started" }, 202))
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            status: "running",
            progress: 42,
            message: "Processing video",
            downloadUrl: null,
            outputFileName: null
          },
          200
        )
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            status: "complete",
            progress: 100,
            message: "Video generated",
            downloadUrl: "/api/v1/jobs/job-1/download",
            outputFileName: "branded.mp4"
          },
          200
        )
      );

    globalThis.fetch = fetchMock as typeof fetch;

    render(<App />);
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText(/video file/i), createFile("input.mp4", "video/mp4"));
    await user.upload(screen.getByLabelText(/logo image/i), createFile("logo.png", "image/png"));
    await user.click(screen.getByRole("button", { name: /generate video/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText(/42%/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /download branded.mp4/i })).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("renders API error message on failed submit", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockJsonResponse(
        {
          status: "error",
          code: "VALIDATION_ERROR",
          message: "Bad request"
        },
        400
      )
    );

    globalThis.fetch = fetchMock as typeof fetch;

    render(<App />);
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText(/video file/i), createFile("input.mp4", "video/mp4"));
    await user.upload(screen.getByLabelText(/logo image/i), createFile("logo.png", "image/png"));
    await user.click(screen.getByRole("button", { name: /generate video/i }));

    await waitFor(() => {
      expect(screen.getByText(/bad request/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/^error$/i)).toBeInTheDocument();
  });
});
