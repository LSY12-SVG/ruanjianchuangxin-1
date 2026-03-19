/* eslint-env jest */
require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('@uginy/react-native-liquid-glass', () => {
  const React = require('react');
  const {View} = require('react-native');
  const LiquidGlassView = ({children, style}) => React.createElement(View, {style}, children);
  return {
    __esModule: true,
    default: LiquidGlassView,
    LiquidGlassView,
    LIQUID_GLASS_DEFAULTS: {},
    LIQUID_GLASS_FROSTED: {},
    LIQUID_GLASS_CRYSTAL: {},
    LIQUID_GLASS_WARM: {},
    LIQUID_GLASS_IRIDESCENT: {},
  };
});
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    KeyboardAvoidingView: View,
    KeyboardProvider: ({children}) => React.createElement(React.Fragment, null, children),
  };
});
jest.mock('react-native-gifted-chat', () => {
  const React = require('react');
  const {View, Text} = require('react-native');
  const GiftedChat = ({renderChatFooter}) =>
    React.createElement(
      View,
      null,
      React.createElement(Text, null, 'GiftedChatMock'),
      renderChatFooter ? renderChatFooter() : null,
    );
  return {
    GiftedChat,
    Bubble: ({children}) => React.createElement(View, null, children),
    InputToolbar: ({children}) => React.createElement(View, null, children),
    Send: ({children}) => React.createElement(View, null, children),
  };
});
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
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///tmp/mock-shot.png'),
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
  saveToGallery: jest.fn(async request => ({
    uri: 'content://media/external/images/media/1001',
    displayName: request.displayName || 'visiongenie_export.png',
    mimeType: request.mimeType || 'image/png',
    fileSize: 1024,
    relativePath: 'Pictures/VisionGenie',
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
