const {pickDefined, isObject, toNumberIfFinite} = require('./shared');

const normalizeSegmentationRequest = body => {
  if (!isObject(body)) {
    return body;
  }

  const imageRaw = isObject(body.image) ? body.image : body.image;
  if (!isObject(imageRaw)) {
    return body;
  }

  return {
    ...body,
    image: {
      ...imageRaw,
      uri: pickDefined(imageRaw.uri, imageRaw.image_uri),
      mimeType: pickDefined(imageRaw.mimeType, imageRaw.mime_type),
      base64: pickDefined(imageRaw.base64, imageRaw.base_64),
      width: toNumberIfFinite(imageRaw.width),
      height: toNumberIfFinite(imageRaw.height),
    },
  };
};

module.exports = {
  normalizeSegmentationRequest,
};
