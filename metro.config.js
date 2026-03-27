const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');

const escapePathForRegex = segment =>
  segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const blockListedBuildPaths = [
  /android[\\/]\.cxx[\\/].*/,
  /android[\\/]build[\\/].*/,
  /node_modules[\\/].+[\\/]android[\\/]\.cxx[\\/].*/,
  /node_modules[\\/].+[\\/]android[\\/]build[\\/].*/,
].map(pattern =>
  new RegExp(escapePathForRegex(__dirname) + '[\\\\/]' + pattern.source),
);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  server: {
    port: 8081,
  },
  resolver: {
    blockList: blockListedBuildPaths,
  },
};

module.exports = wrapWithReanimatedMetroConfig(
  mergeConfig(getDefaultConfig(__dirname), config),
);
