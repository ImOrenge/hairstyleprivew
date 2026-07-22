export type AsyncBoundaryState = "error" | "pending" | "empty" | "ready";

export interface AsyncBoundaryStateInput {
  error?: unknown;
  pending?: boolean;
  isEmpty?: boolean;
}

export function resolveAsyncBoundaryState({
  error,
  pending = false,
  isEmpty = false,
}: AsyncBoundaryStateInput): AsyncBoundaryState {
  if (error) return "error";
  if (pending) return "pending";
  if (isEmpty) return "empty";
  return "ready";
}
