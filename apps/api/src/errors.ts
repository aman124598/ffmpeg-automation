export class AppError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly jobId?: string;

  public constructor(code: string, message: string, httpStatus: number, jobId?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.jobId = jobId;
  }
}
