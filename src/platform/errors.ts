export type AppErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "LIMIT_EXCEEDED"
  | "NETWORK_REQUIRED"
  | "NETWORK_FAILED"
  | "FEATURE_DISABLED"
  | "UNAVAILABLE";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly userHint?: string,
    public readonly details?: Record<string, boolean | number | string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toUserError(error: unknown): { title: string; message: string; hint?: string } {
  if (error instanceof AppError) return { title: error.code.replace(/_/g, " "), message: error.message, hint: error.userHint };
  if (error instanceof Error) return { title: "Operation failed", message: error.message };
  return { title: "Operation failed", message: "An unexpected error occurred. Try a smaller input or reset the tool." };
}