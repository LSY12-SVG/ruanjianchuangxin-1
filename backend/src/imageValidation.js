const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function validateImageUpload(file, maxUploadBytes) {
  if (!file) {
    return {
      code: 'IMAGE_REQUIRED',
      message: 'Please upload an image file in the image field.',
      details: {
        field: 'image',
      },
    };
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return {
      code: 'UNSUPPORTED_IMAGE_TYPE',
      message: 'Only JPEG, PNG, and WebP images are supported.',
      details: {
        receivedMimeType: file.mimetype,
        allowedMimeTypes: [...ALLOWED_MIME_TYPES],
      },
    };
  }

  if (file.size > maxUploadBytes) {
    return {
      code: 'FILE_TOO_LARGE',
      message: 'The uploaded image is too large.',
      details: {
        maxUploadBytes,
        receivedBytes: file.size,
      },
    };
  }

  return null;
}

module.exports = {
  validateImageUpload,
};
