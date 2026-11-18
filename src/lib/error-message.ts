/** Handles Error instances, Supabase errors, and non-Error thrown values. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return typeof error === "string" ? error : "An unexpected error occurred.";
}
