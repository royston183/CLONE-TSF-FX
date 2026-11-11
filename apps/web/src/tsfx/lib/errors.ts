export interface ErrorDetail { tab?: string; row?: number; field?: string; message: string }

/** An error with the HTTP status the API answers with; `details` carries per-row problems. */
export class HttpError extends Error {
  readonly status: number;
  readonly details: ErrorDetail[];
  constructor(status: number, message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}
