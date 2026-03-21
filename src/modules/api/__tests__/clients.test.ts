import {colorApi} from '../color';
import {communityApi} from '../community';
import {fetchModulesHealth} from '../gateway';
import {requestApi} from '../http';
import type {ColorRequestContext} from '../types';

jest.mock('../http', () => ({
  requestApi: jest.fn(),
}));

const asMock = <T extends (...args: never[]) => unknown>(value: T) =>
  value as jest.MockedFunction<T>;

const createContext = (): ColorRequestContext => ({
  locale: 'zh-CN',
  currentParams: {
    basic: {
      exposure: 0,
      contrast: 0,
      brightness: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
    },
    colorBalance: {
      temperature: 0,
      tint: 0,
      redBalance: 0,
      greenBalance: 0,
      blueBalance: 0,
      vibrance: 0,
      saturation: 0,
    },
    pro: {
      curves: {
        master: [0, 0.25, 0.5, 0.75, 1],
        r: [0, 0.25, 0.5, 0.75, 1],
        g: [0, 0.25, 0.5, 0.75, 1],
        b: [0, 0.25, 0.5, 0.75, 1],
      },
      wheels: {
        shadows: {hue: 0, sat: 0, luma: 0},
        midtones: {hue: 0, sat: 0, luma: 0},
        highlights: {hue: 0, sat: 0, luma: 0},
      },
    },
  },
  image: {
    mimeType: 'image/jpeg',
    width: 1200,
    height: 900,
    base64: 'ZmFrZQ==',
  },
  imageStats: {
    lumaMean: 0.42,
    lumaStd: 0.21,
    saturationMean: 0.34,
    highlightClipPct: 0.02,
    shadowClipPct: 0.04,
  },
});

describe('module api clients', () => {
  const mockedRequestApi = asMock(requestApi);

  beforeEach(() => {
    mockedRequestApi.mockReset();
  });

  it('calls strict color initial-suggest endpoint', async () => {
    mockedRequestApi.mockResolvedValueOnce({
      actions: [],
      confidence: 0.9,
      reasoningSummary: 'ok',
      needsConfirmation: false,
      message: 'ok',
      source: 'cloud',
    });

    await colorApi.initialSuggest(createContext());

    expect(mockedRequestApi).toHaveBeenCalledWith(
      '/v1/modules/color/initial-suggest',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('propagates community backend errors without fallback data', async () => {
    mockedRequestApi.mockRejectedValueOnce(new Error('post_not_found'));

    await expect(communityApi.getFeed()).rejects.toThrow('post_not_found');
    expect(mockedRequestApi).toHaveBeenCalledTimes(1);
  });

  it('maps /v1/modules/health response to module status list', async () => {
    mockedRequestApi.mockResolvedValueOnce({
      ok: true,
      missingModules: [],
      modules: {
        color: {ok: true, provider: 'openai', strictMode: true},
        modeling: {ok: false, provider: 'tripo', strictMode: true},
      },
    });

    const result = await fetchModulesHealth();

    expect(result.ok).toBe(true);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({module: 'color', status: 'healthy', ok: true}),
        expect.objectContaining({module: 'modeling', status: 'down', ok: false}),
      ]),
    );
  });
});
