const isPositiveNumber = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

const hasImagePayload = body =>
  Boolean(
    body &&
      body.image &&
      typeof body.image === 'object' &&
      (typeof body.image.base64 === 'string' || typeof body.image.uri === 'string'),
  );

const validateSegmentationRequest = body => {
  if (!hasImagePayload(body)) {
    return {ok: false, message: 'image payload is required'};
  }

  if (
    body.image.width !== undefined &&
    body.image.width !== null &&
    !isPositiveNumber(body.image.width)
  ) {
    return {ok: false, message: 'image.width must be a positive number'};
  }

  if (
    body.image.height !== undefined &&
    body.image.height !== null &&
    !isPositiveNumber(body.image.height)
  ) {
    return {ok: false, message: 'image.height must be a positive number'};
  }

  return {ok: true};
};

module.exports = {
  validateSegmentationRequest,
};
