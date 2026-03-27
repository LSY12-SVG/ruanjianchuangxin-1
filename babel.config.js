const plugins = [];

try {
  require.resolve('react-native-reanimated/plugin');
  plugins.push('react-native-reanimated/plugin');
} catch {
  // Allow Jest and local tooling to run even when the optional plugin package
  // is not present in the current install.
}

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins,
};
