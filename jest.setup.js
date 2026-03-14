/* eslint-env jest */
require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('lottie-react-native', () => 'LottieView');
jest.mock('react-native-fast-image', () => 'FastImage');
jest.mock('@shopify/flash-list', () => ({
  FlashList: 'FlashList',
}));
jest.mock('moti', () => ({
  MotiView: 'MotiView',
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-mmkv', () => {
  const buckets = new Map();
  return {
    MMKV: jest.fn().mockImplementation(({id} = {}) => {
      const bucketId = id || 'default';
      if (!buckets.has(bucketId)) {
        buckets.set(bucketId, new Map());
      }
      const bucket = buckets.get(bucketId);
      return {
        set: jest.fn((key, value) => {
          bucket.set(key, String(value));
        }),
        getString: jest.fn(key => bucket.get(key) ?? null),
        delete: jest.fn(key => {
          bucket.delete(key);
        }),
      };
    }),
  };
});

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(async () => ({didCancel: true})),
  launchImageLibrary: jest.fn(async () => ({didCancel: true})),
}));

const reactNative = require('react-native');
reactNative.NativeModules.VoiceRecognition = {
  start: jest.fn(async () => undefined),
  stop: jest.fn(async () => undefined),
  destroy: jest.fn(async () => undefined),
};
reactNative.NativeModules.ProColorEngine = {
  getCapabilities: jest.fn(async () => ({
    platform: 'android',
    supportsNativePro: true,
    recommendedPreviewScale: 1,
    recommendedExportFormat: 'png16',
    maxPreviewDimension: 4096,
    workingSpace: 'linear_prophoto',
  })),
  decodeSource: jest.fn(async () => ({
    width: 4000,
    height: 3000,
    previewBase64: 'ZmFrZQ==',
    nativeSourcePath: '/tmp/fake.dng',
    bitDepthHint: 12,
    workingSpace: 'linear_prophoto',
    sourceType: 'raw',
  })),
  exportImage: jest.fn(async request => ({
    uri: '/tmp/fake-export.png',
    width: 3000,
    height: 2000,
    fileSize: 1024,
    format: request.format,
    bitDepth: request.bitDepth,
    iccProfile: request.iccProfile,
    warnings: [],
  })),
};
reactNative.NativeModules.SourceCode = {
  scriptURL: 'http://127.0.0.1:8081/index.bundle?platform=android&dev=true',
};

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: 'Canvas',
  Image: 'SkiaImage',
  ColorMatrix: 'ColorMatrix',
  ImageShader: 'ImageShader',
  Shader: 'Shader',
  Fill: 'Fill',
  Skia: {
    Data: {
      fromBase64: jest.fn(() => ({})),
      fromBytes: jest.fn(() => ({})),
    },
    Image: {
      MakeImageFromEncoded: jest.fn(() => ({
        width: () => 800,
        height: () => 600,
      })),
      MakeImage: jest.fn(() => ({
        width: () => 256,
        height: () => 16,
      })),
    },
    RuntimeEffect: {
      Make: jest.fn(() => ({})),
    },
    ColorType: {
      RGBA_8888: 4,
    },
    AlphaType: {
      Unpremul: 3,
    },
  },
}));
