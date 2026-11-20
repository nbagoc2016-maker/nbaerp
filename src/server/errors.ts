/** An error whose message is safe and useful to show to the user (validation, business rules). */
export class AppError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError(message);
}
