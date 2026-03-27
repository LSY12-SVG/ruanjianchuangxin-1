/* eslint-env jest */
try {
  require('react-native-gesture-handler/jestSetup');
} catch {
  // Some local installs only include the runtime package, so keep Jest resilient.
}

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon', {virtual: true});
jest.mock('react-native-linear-gradient', () => 'LinearGradient', {virtual: true});
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    GestureHandlerRootView: ({children, style}) => React.createElement(View, {style}, children),
  };
}, {virtual: true});
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({children}) => React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => ({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    }),
  };
}, {virtual: true});
jest.mock('react-native-paper', () => {
  const React = require('react');
  return {
    MD3LightTheme: {
      dark: false,
      mode: 'adaptive',
      roundness: 4,
      version: 3,
      animation: {scale: 1},
      colors: {},
      fonts: {},
    },
    PaperProvider: ({children}) => React.createElement(React.Fragment, null, children),
  };
}, {virtual: true});
jest.mock('@tanstack/react-query', () => {
  const React = require('react');
  class QueryClient {
    clear = jest.fn();

    invalidateQueries = jest.fn(async () => undefined);

    constructor(options) {
      this.options = options;
    }
  }

  return {
    QueryClient,
    QueryClientProvider: ({children}) => React.createElement(React.Fragment, null, children),
    useQuery: jest.fn(() => ({
      data: undefined,
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    })),
  };
}, {virtual: true});
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
}, {virtual: true});
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    KeyboardAvoidingView: View,
    KeyboardProvider: ({children}) => React.createElement(React.Fragment, null, children),
  };
}, {virtual: true});
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
}, {virtual: true});
jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map();
  return {
    setItem: jest.fn(async (key, value) => {
      storage.set(key, String(value));
    }),
    getItem: jest.fn(async key => (storage.has(key) ? storage.get(key) : null)),
    removeItem: jest.fn(async key => {
      storage.delete(key);
    }),
    clear: jest.fn(async () => {
      storage.clear();
    }),
    getAllKeys: jest.fn(async () => Array.from(storage.keys())),
    multiGet: jest.fn(async keys => keys.map(key => [key, storage.has(key) ? storage.get(key) : null])),
    multiSet: jest.fn(async pairs => {
      pairs.forEach(([key, value]) => storage.set(key, String(value)));
    }),
    multiRemove: jest.fn(async keys => {
      keys.forEach(key => storage.delete(key));
    }),
  };
}, {virtual: true});
jest.mock('lottie-react-native', () => 'LottieView', {virtual: true});
jest.mock('react-native-fast-image', () => 'FastImage', {virtual: true});
jest.mock('@shopify/flash-list', () => ({
  FlashList: 'FlashList',
}), {virtual: true});
jest.mock('moti', () => ({
  MotiView: 'MotiView',
}), {virtual: true});
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: component => component,
    },
    View,
    createAnimatedComponent: component => component,
    useSharedValue: jest.fn(value => ({value})),
    useAnimatedStyle: jest.fn(updater => updater()),
    useAnimatedProps: jest.fn(updater => updater()),
    useDerivedValue: jest.fn(updater => ({value: updater()})),
    useAnimatedReaction: jest.fn(),
    runOnJS: fn => fn,
    runOnUI: fn => fn,
    withTiming: jest.fn(value => value),
    withSpring: jest.fn(value => value),
    withDelay: jest.fn((_, value) => value),
    cancelAnimation: jest.fn(),
    interpolate: jest.fn(value => value),
    Extrapolation: {
      CLAMP: 'clamp',
    },
    Easing: {
      linear: jest.fn(),
      quad: jest.fn(),
      cubic: jest.fn(),
      out: jest.fn(value => value),
      inOut: jest.fn(value => value),
    },
    FadeIn: {
      duration: jest.fn(() => ({})),
    },
    FadeOut: {
      duration: jest.fn(() => ({})),
    },
  };
}, {virtual: true});
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
}, {virtual: true});

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(async () => ({didCancel: true})),
  launchImageLibrary: jest.fn(async () => ({didCancel: true})),
}), {virtual: true});
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///tmp/mock-shot.png'),
}), {virtual: true});
jest.mock('react-native-webview', () => {
  const React = require('react');
  const {View} = require('react-native');
  const MockWebView = React.forwardRef((props, ref) =>
    React.createElement(View, {...props, ref}, props.children),
  );
  return {
    WebView: MockWebView,
    default: MockWebView,
  };
}, {virtual: true});

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
}), {virtual: true});
