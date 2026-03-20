const toErrorPayload = ({code, message, details}) => ({
  error: {
    code: String(code || 'INTERNAL_ERROR'),
    message: String(message || 'Unexpected server error.'),
    ...(details && typeof details === 'object' ? {details} : {}),
  },
});

const sendError = (res, status, code, message, details) => {
  res.status(status).json(toErrorPayload({code, message, details}));
};

module.exports = {
  toErrorPayload,
  sendError,
};
