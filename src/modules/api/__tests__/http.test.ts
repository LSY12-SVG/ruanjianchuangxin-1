import {getAuthToken} from '../../../profile/api';
import {resolveBackendBaseCandidates} from '../../../cloud/backendBase';
import {ApiRequestError, requestApi} from '../http';

jest.mock('../../../cloud/backendBase', () => ({
  resolveBackendBaseCandidates: jest.fn(),
}));

jest.mock('../../../profile/api', () => ({
  getAuthToken: jest.fn(),
}));

const asMock = <T extends (...args: never[]) => unknown>(value: T) =>
  value as jest.MockedFunction<T>;

const createJsonResponse = (options: {
  ok: boolean;
  status: number;
  statusText?: string;
  body?: unknown;
}) =>
  ({
    ok: options.ok,
    status: options.status,
    statusText: options.statusText || '',
    text: jest.fn(async () =>
      options.body === undefined ? '' : JSON.stringify(options.body),
    ),
  }) as unknown as Response;

describe('requestApi', () => {
  const mockedResolveBackendBaseCandidates = asMock(resolveBackendBaseCandidates);
  const mockedGetAuthToken = asMock(getAuthToken);
  const runtime = globalThis as typeof globalThis & {fetch: typeof fetch};
  const originalFetch = runtime.fetch;

  beforeEach(() => {
    mockedResolveBackendBaseCandidates.mockReset();
    mockedGetAuthToken.mockReset();
    mockedResolveBackendBaseCandidates.mockReturnValue(['http://127.0.0.1:8787']);
    mockedGetAuthToken.mockReturnValue('');
    runtime.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    runtime.fetch = originalFetch;
  });

  it('parses backend error.code and error.message', async () => {
    (runtime.fetch as unknown as jest.Mock).mockResolvedValueOnce(
      createJsonResponse({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        body: {
          error: {
            code: 'MODEL_UNAVAILABLE',
            message: 'refine model offline',
            requestId: 'req_001',
          },
        },
      }),
    );

    await expect(requestApi('/v1/modules/color/initial-suggest')).rejects.toEqual(
      expect.objectContaining<ApiRequestError>({
        name: 'ApiRequestError',
        code: 'MODEL_UNAVAILABLE',
        message: 'refine model offline',
        status: 503,
        requestId: 'req_001',
      }),
    );
  });

  it('uses next backend base when first candidate fails network', async () => {
    mockedResolveBackendBaseCandidates.mockReturnValue([
      'http://127.0.0.1:8787',
      'http://10.0.2.2:8787',
    ]);
    (runtime.fetch as unknown as jest.Mock)
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValueOnce(
        createJsonResponse({
          ok: true,
          status: 200,
          body: {ok: true, modules: []},
        }),
      );

    const result = await requestApi<{ok: boolean; modules: unknown[]}>(
      '/v1/modules/capabilities',
    );

    expect(result.ok).toBe(true);
    expect(runtime.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns NETWORK_ERROR when all candidates fail', async () => {
    mockedResolveBackendBaseCandidates.mockReturnValue([
      'http://127.0.0.1:8787',
      'http://10.0.2.2:8787',
    ]);
    (runtime.fetch as unknown as jest.Mock)
      .mockRejectedValueOnce(new Error('timeout #1'))
      .mockRejectedValueOnce(new Error('timeout #2'));

    await expect(requestApi('/v1/modules/health')).rejects.toEqual(
      expect.objectContaining({
        code: 'NETWORK_ERROR',
        status: 0,
      }),
    );
  });
});
