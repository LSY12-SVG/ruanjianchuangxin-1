/* eslint-env jest */
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-linear-gradient', () => 'LinearGradient');

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

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: 'Canvas',
  Image: 'SkiaImage',
  ColorMatrix: 'ColorMatrix',
  Skia: {
    Data: {
      fromBase64: jest.fn(() => ({})),
    },
    Image: {
      MakeImageFromEncoded: jest.fn(() => ({
        width: () => 800,
        height: () => 600,
      })),
    },
  },
}));
