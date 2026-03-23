import {Platform} from 'react-native';

export const HERO_CREATE = Platform.select({
  android: require('./hero-create.webp'),
  ios: require('./hero-create.jpg'),
  default: require('./hero-create.jpg'),
});

export const HERO_MODEL = Platform.select({
  android: require('./hero-model.webp'),
  ios: require('./hero-model.jpg'),
  default: require('./hero-model.jpg'),
});

export const HERO_AGENT = Platform.select({
  android: require('./hero-agent.webp'),
  ios: require('./hero-agent.jpg'),
  default: require('./hero-agent.jpg'),
});

export const HERO_COMMUNITY = Platform.select({
  android: require('./hero-community.webp'),
  ios: require('./hero-community.jpg'),
  default: require('./hero-community.jpg'),
});
