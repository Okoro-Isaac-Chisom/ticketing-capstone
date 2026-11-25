// A single error type for every business-rule failure in the app.
// The `code` is machine-readable (e.g. "SOLD_OUT") so callers can react to it
// without parsing the human-readable message.
export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code; // e.g. VALIDATION, NOT_FOUND, SOLD_OUT, ALREADY_CANCELLED
  }
}
