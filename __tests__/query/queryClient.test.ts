import {queryClient} from '../../src/providers/queryClient';

describe('query client defaults', () => {
  it('uses retry and stale defaults for app data layer', () => {
    const queryDefaults = queryClient.getDefaultOptions().queries;
    expect(queryDefaults?.retry).toBe(1);
    expect(queryDefaults?.staleTime).toBe(15000);
  });
});
