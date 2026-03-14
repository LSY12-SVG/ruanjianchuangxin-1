import {buildVoiceImageContext} from '../../src/voice/imageContext';
import type {ImagePickerResult} from '../../src/hooks/useImagePicker';

const buildSelectedImage = (type: string): ImagePickerResult => ({
  success: true,
  uri: 'file:///tmp/sample',
  width: 1200,
  height: 800,
  type,
  base64: 'ZmFrZQ==',
});

const buildFakeSkImage = (encodeFn?: (quality?: number) => string) =>
  ({
    width: () => 1200,
    height: () => 800,
    readPixels: jest.fn(() => new Uint8Array(96 * 64 * 4).fill(128)),
    encodeToBase64: jest.fn((_fmt?: number, quality?: number) =>
      encodeFn ? encodeFn(quality) : 'a'.repeat(1_000_000),
    ),
  }) as unknown as {
    width: () => number;
    height: () => number;
    readPixels: jest.Mock;
    encodeToBase64: jest.Mock;
  };

describe('voice image context cloud payloads', () => {
  it('forces refine payload to jpeg for heif source', () => {
    const context = buildVoiceImageContext(
      buildSelectedImage('image/heic'),
      buildFakeSkImage() as never,
    );

    expect(context).not.toBeNull();
    expect(context?.image.mimeType).toBe('image/jpeg');
    expect(context?.cloudPayloads.refine.mimeType).toBe('image/jpeg');
    expect(context?.cloudPayloads.fast.base64).toBe('');
  });

  it('falls back to lower quality when payload exceeds budget', () => {
    const context = buildVoiceImageContext(
      buildSelectedImage('image/x-adobe-dng'),
      buildFakeSkImage(quality => {
        if (quality === 84) {
          return 'a'.repeat(2_600_000);
        }
        if (quality === 78) {
          return 'a'.repeat(1_600_000);
        }
        return 'a'.repeat(1_200_000);
      }) as never,
    );

    expect(context).not.toBeNull();
    expect(context?.cloudPayloads.refine.encodeQuality).toBe(78);
    expect((context?.cloudPayloads.refine.payloadBytes || 0) <= 1_800_000).toBe(true);
    expect(context?.cloudPayloads.refine.mimeType).toBe('image/jpeg');
  });
});
