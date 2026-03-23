import React from 'react';
import {
  ImageBackground,
  type ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {canvasText} from '../../theme/canvasDesign';
import {VISION_THEME} from '../../theme/visionTheme';

interface PageHeroProps {
  image: ImageSourcePropType;
  title: string;
  subtitle: string;
  overlayColors?: [string, string, string];
  variant?: 'warm' | 'editorial' | 'contrast';
  overlayStrength?: 'soft' | 'normal' | 'strong';
  height?: number;
}

export const PageHero: React.FC<PageHeroProps> = ({
  image,
  title,
  subtitle,
  overlayColors,
  variant = 'warm',
  overlayStrength = 'normal',
  height = 136,
}) => {
  const resolvedColors =
    overlayColors ||
    (variant === 'contrast'
      ? (['rgba(20,16,14,0.12)', 'rgba(85,44,35,0.5)', 'rgba(113,42,31,0.72)'] as [string, string, string])
      : variant === 'editorial'
        ? (['rgba(255,248,243,0.1)', 'rgba(199,132,108,0.4)', 'rgba(153,71,56,0.58)'] as [string, string, string])
        : VISION_THEME.gradients.hero);
  const overlayOpacity =
    overlayStrength === 'soft' ? 0.85 : overlayStrength === 'strong' ? 1 : 0.94;

  return (
    <ImageBackground source={image} style={[styles.hero, {height}]} imageStyle={styles.heroImage}>
      <LinearGradient colors={resolvedColors} style={[styles.overlay, {opacity: overlayOpacity}]} />
      <View style={styles.copyWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  hero: {
    height: 136,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(171, 129, 110, 0.35)',
    backgroundColor: '#EADBD1',
  },
  heroImage: {
    borderRadius: 24,
    resizeMode: 'cover',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  copyWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  title: {
    ...canvasText.heroTitle,
    color: '#2B2623',
  },
  subtitle: {
    ...canvasText.body,
    marginTop: 3,
    color: 'rgba(70, 58, 52, 0.84)',
  },
});
