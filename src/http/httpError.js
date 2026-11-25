// An error that already knows its HTTP status. Used for problems with the
// request itself (bad JSON, body too large), not for business rules.
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}
