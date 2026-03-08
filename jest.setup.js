jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    WebView: ({ testID }) => React.createElement(View, { testID: testID || 'mock-webview' }),
  };
});
