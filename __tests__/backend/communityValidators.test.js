const {
  parsePageAndSize,
  sanitizePostPayload,
  sanitizeCommentPayload,
  validateFeedFilter,
  validateStatus,
} = require('../../backend/src/community/validators');

describe('community validators', () => {
  test('parsePageAndSize clamps page/size and returns offset', () => {
    const parsed = parsePageAndSize({page: '2', size: '99'}, 10, 30);
    expect(parsed).toEqual({page: 2, size: 30, offset: 30});
  });

  test('sanitizePostPayload trims and keeps tags list', () => {
    const payload = sanitizePostPayload({
      title: '  标题  ',
      content: '  内容  ',
      tags: [' 人像 ', '', '电影感'],
      beforeUrl: '  http://before  ',
      afterUrl: 'http://after',
      gradingParams: {basic: {contrast: 10}},
    });
    expect(payload.title).toBe('标题');
    expect(payload.content).toBe('内容');
    expect(payload.tags).toEqual(['人像', '电影感']);
    expect(payload.beforeUrl).toBe('http://before');
    expect(payload.afterUrl).toBe('http://after');
    expect(payload.gradingParams).toEqual({basic: {contrast: 10}});
  });

  test('sanitizeCommentPayload parses parentId', () => {
    const payload = sanitizeCommentPayload({
      content: '  test  ',
      parentId: '5',
    });
    expect(payload).toEqual({content: 'test', parentId: 5});
  });

  test('filter and status validation', () => {
    expect(validateFeedFilter('cinema')).toBe('cinema');
    expect(validateFeedFilter('unexpected')).toBe('all');
    expect(validateStatus('published')).toBe('published');
    expect(validateStatus('unknown')).toBe('draft');
  });
});
