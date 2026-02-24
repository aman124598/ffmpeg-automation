import { describe, expect, it } from "vitest";

import { AppError } from "../../src/errors.js";
import { validateLogoFile, validateVideoFile } from "../../src/utils/fileValidation.js";

const baseFile = {
  path: "/tmp/file"
};

describe("validateVideoFile", () => {
  it("accepts supported video format and MIME", () => {
    expect(() =>
      validateVideoFile({
        ...baseFile,
        originalname: "video.mp4",
        mimetype: "video/mp4",
        size: 1024
      })
    ).not.toThrow();
  });

  it("rejects unsupported video extension", () => {
    expect(() =>
      validateVideoFile({
        ...baseFile,
        originalname: "video.webm",
        mimetype: "video/webm",
        size: 1024
      })
    ).toThrow(AppError);
  });
});

describe("validateLogoFile", () => {
  it("rejects oversized logo", () => {
    expect(() =>
      validateLogoFile({
        ...baseFile,
        originalname: "logo.png",
        mimetype: "image/png",
        size: 25 * 1024 * 1024
      })
    ).toThrow(AppError);
  });
});
