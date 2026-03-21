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

interface PageHeroProps {
  image: ImageSourcePropType;
  title: string;
  subtitle: string;
  overlayColors: [string, string, string];
}

export const PageHero: React.FC<PageHeroProps> = ({
  image,
  title,
  subtitle,
  overlayColors,
}) => {
  return (
    <ImageBackground source={image} style={styles.hero} imageStyle={styles.heroImage}>
      <LinearGradient colors={overlayColors} style={styles.overlay} />
      <View style={styles.copyWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  hero: {
    height: 132,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(172, 219, 255, 0.28)',
    backgroundColor: '#0F172A',
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
    color: '#EEF5FF',
  },
  subtitle: {
    ...canvasText.body,
    marginTop: 3,
    color: 'rgba(238,245,255,0.78)',
  },
});
