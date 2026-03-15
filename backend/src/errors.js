class ApiError extends Error {
  constructor(statusCode, codeOrMessage, messageOrDetails, detailsArg) {
    const usesExplicitCode = typeof messageOrDetails === 'string';
    const code = usesExplicitCode
      ? String(codeOrMessage || defaultErrorCode(statusCode))
      : defaultErrorCode(statusCode);
    const message = usesExplicitCode ? messageOrDetails : codeOrMessage;
    const details = usesExplicitCode ? detailsArg : messageOrDetails;

    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function defaultErrorCode(statusCode) {
  if (statusCode === 404) {
    return 'NOT_FOUND';
  }

  if (statusCode >= 500) {
    return 'INTERNAL_ERROR';
  }

  return 'BAD_REQUEST';
}

function toErrorResponse(error) {
  const statusCode =
    error instanceof ApiError ? error.statusCode : error?.statusCode || 500;
  const code =
    error instanceof ApiError ? error.code : defaultErrorCode(statusCode);
  const message = error?.message || 'Unexpected server error.';
  const payload = {
    error: {
      code,
      message,
    },
  };

  if (error?.details !== undefined) {
    payload.error.details = error.details;
  }

  return payload;
}

module.exports = {
  ApiError,
  defaultErrorCode,
  toErrorResponse,
};
