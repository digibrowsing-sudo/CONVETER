'use strict';

// Stable, documented error codes (spec 7.6).
//
// These codes are part of the public API contract: the frontend switches on
// them and any future API customer will too. Renaming one is a breaking change.
// The message attached to an ApiError is always safe to show a user — it must
// never contain a filename, a path, engine stderr or anything extracted from a
// document.

const CODES = {
  FILE_TOO_LARGE: { status: 413, retryable: false },
  TOO_MANY_FILES: { status: 400, retryable: false },
  UNSUPPORTED_TYPE: { status: 415, retryable: false },
  ENCRYPTED_INPUT: { status: 422, retryable: false },
  CORRUPT_INPUT: { status: 422, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  QUEUE_FULL: { status: 503, retryable: true },
  CONVERSION_FAILED: { status: 500, retryable: true },
  TIMEOUT: { status: 504, retryable: true },
  JOB_EXPIRED: { status: 410, retryable: false },
  BANK_UNSUPPORTED: { status: 422, retryable: false },

  // Not in the spec table, but needed for a complete surface. Kept alongside so
  // there is still exactly one place where a code is defined.
  BAD_REQUEST: { status: 400, retryable: false },
  NOT_FOUND: { status: 404, retryable: false },
  INVALID_TOKEN: { status: 403, retryable: false },
  CONSENT_REQUIRED: { status: 422, retryable: false },
  INTERNAL: { status: 500, retryable: true },
};

/**
 * Deterministic failures. Retrying these burns CPU we do not have on a job that
 * cannot possibly succeed, so the worker marks them unrecoverable (spec 8.2).
 */
const NON_RETRYABLE_CODES = Object.freeze([
  'CORRUPT_INPUT',
  'UNSUPPORTED_TYPE',
  'ENCRYPTED_INPUT',
  'BANK_UNSUPPORTED',
  'FILE_TOO_LARGE',
  'TOO_MANY_FILES',
  'CONSENT_REQUIRED',
]);

class ApiError extends Error {
  /**
   * @param {keyof CODES} code   stable error code from the table above
   * @param {string} message     user-safe text, shown in the UI verbatim
   * @param {object} [extra]     additional JSON fields (e.g. retryAfter, limit)
   */
  constructor(code, message, extra = {}) {
    super(message);
    const entry = CODES[code];
    if (!entry) throw new Error(`unknown error code "${code}"`);
    this.name = 'ApiError';
    this.code = code;
    this.status = entry.status;
    this.retryable = entry.retryable;
    this.extra = extra;
  }

  /** True when retrying the job can never change the outcome. */
  get unrecoverable() {
    return NON_RETRYABLE_CODES.includes(this.code);
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, ...this.extra } };
  }
}

const err = (code, message, extra) => new ApiError(code, message, extra);

module.exports = { ApiError, CODES, NON_RETRYABLE_CODES, err };
