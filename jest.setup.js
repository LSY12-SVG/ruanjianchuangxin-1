jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    WebView: ({ testID }) => React.createElement(View, { testID: testID || 'mock-webview' }),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const {View} = require('react-native');

  return {
    SafeAreaView: ({children, ...props}) => React.createElement(View, props, children),
  };
});
