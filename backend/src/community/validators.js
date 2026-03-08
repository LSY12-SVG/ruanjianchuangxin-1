const normalizePage = value => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return Math.floor(parsed);
};

const normalizeSize = (value, pageSizeDefault, pageSizeMax) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return pageSizeDefault;
  }
  return Math.min(Math.floor(parsed), pageSizeMax);
};

const parsePageAndSize = (query, pageSizeDefault, pageSizeMax) => {
  const page = normalizePage(query.page);
  const size = normalizeSize(query.size, pageSizeDefault, pageSizeMax);
  return {
    page,
    size,
    offset: (page - 1) * size,
  };
};

const normalizeTags = value => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 12);
};

const sanitizePostPayload = body => ({
  title: typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : '',
  content: typeof body?.content === 'string' ? body.content.trim().slice(0, 4000) : '',
  beforeUrl: typeof body?.beforeUrl === 'string' ? body.beforeUrl.trim().slice(0, 1200) : '',
  afterUrl: typeof body?.afterUrl === 'string' ? body.afterUrl.trim().slice(0, 1200) : '',
  tags: normalizeTags(body?.tags),
  gradingParams:
    body?.gradingParams && typeof body.gradingParams === 'object'
      ? body.gradingParams
      : {},
});

const validateStatus = value => (value === 'draft' || value === 'published' ? value : 'draft');

const validateFeedFilter = value =>
  value === 'portrait' || value === 'cinema' || value === 'vintage' ? value : 'all';

const sanitizeCommentPayload = body => {
  const content = typeof body?.content === 'string' ? body.content.trim().slice(0, 1000) : '';
  const parentId =
    body?.parentId === undefined || body?.parentId === null
      ? null
      : Number(body.parentId) || null;
  return {content, parentId};
};

module.exports = {
  parsePageAndSize,
  sanitizePostPayload,
  sanitizeCommentPayload,
  validateStatus,
  validateFeedFilter,
  normalizeTags,
};
