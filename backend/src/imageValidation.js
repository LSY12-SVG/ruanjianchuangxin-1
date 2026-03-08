const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function validateImageUpload(file, maxUploadBytes) {
  if (!file) {
    return 'Please upload an image file in the image field.';
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return 'Only JPEG, PNG, and WebP images are supported.';
  }

  if (file.size > maxUploadBytes) {
    return 'The uploaded image is too large.';
  }

  return null;
}

module.exports = {
  validateImageUpload,
};
