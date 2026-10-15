// Stand-in for encore.dev/api in the service tests: the real module loads the Encore runtime,
// which a unit test does not have. Only what the services use of it - errors that carry the
// code the API answers with, and the details some of them add.
export const ErrCode = { NotFound: "not_found" } as const;

export class APIError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "APIError";
  }

  static notFound = (message: string) => new APIError("not_found", message);
  static aborted = (message: string) => new APIError("aborted", message);
  static invalidArgument = (message: string) => new APIError("invalid_argument", message);
  static failedPrecondition = (message: string) => new APIError("failed_precondition", message);
  static permissionDenied = (message: string) => new APIError("permission_denied", message);
  static alreadyExists = (message: string) => new APIError("already_exists", message);
  static unavailable = (message: string) => new APIError("unavailable", message);

  withDetails(details: Record<string, unknown>) {
    return new APIError(this.code, this.message, details);
  }
}
