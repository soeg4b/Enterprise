// RFC 7807 problem+json error envelope and helpers.

export class HttpError extends Error {
  status: number;
  code: string;
  detail?: string;
  errors?: Array<{ path: string; msg: string }>;

  constructor(status: number, code: string, message: string, detail?: string, errors?: Array<{ path: string; msg: string }>) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.errors = errors;
  }
}

export const Errors = {
  badRequest: (detail: string, errors?: Array<{ path: string; msg: string }>) =>
    new HttpError(400, 'VALIDATION_FAILED', 'ValidationError', detail, errors),
  unauthorized: (detail = 'Authentication required') =>
    new HttpError(401, 'UNAUTHENTICATED', 'Unauthenticated', detail),
  forbidden: (detail = 'Forbidden') => new HttpError(403, 'FORBIDDEN', 'Forbidden', detail),
  notFound: (what: string) => new HttpError(404, 'NOT_FOUND', 'NotFound', `${what} not found`),
  conflict: (detail: string) => new HttpError(409, 'CONFLICT', 'Conflict', detail),
  businessRule: (detail: string) => new HttpError(422, 'BUSINESS_RULE', 'BusinessRule', detail),
  rateLimited: (detail = 'Too many requests') => new HttpError(429, 'RATE_LIMITED', 'RateLimited', detail),
  internal: (detail = 'Unexpected error') => new HttpError(500, 'INTERNAL', 'InternalError', detail),
  notImplemented: (what = 'This endpoint is not yet implemented') =>
    new HttpError(501, 'NOT_IMPLEMENTED', 'NotImplemented', what),
};
