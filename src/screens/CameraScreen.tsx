import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

type TabType = 'home' | 'camera' | 'assistant' | 'profile';

interface CameraScreenProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const CameraScreen: React.FC<CameraScreenProps> = ({activeTab, onTabChange}) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={['#2D5A5A', '#1A3A3A']}
        style={styles.gradient}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View style={styles.topBarLine} />
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Create</Text>
            <Text style={styles.title}>Magic</Text>
            <View style={styles.subtitleContainer}>
              <Text style={styles.subtitle}>STUDIO MODE</Text>
              <View style={styles.dot} />
            </View>
          </View>

          <TouchableOpacity style={styles.mainCard} activeOpacity={0.8}>
            <View style={styles.mainCardContent}>
              <Icon name="color-palette-outline" size={40} color="#fff" />
              <Text style={styles.mainCardTitle}>AI 智能调色</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.smallCardsContainer}>
            <TouchableOpacity style={[styles.smallCard, {backgroundColor: '#4ECDC4'}]} activeOpacity={0.8}>
              <View style={styles.smallCardContent}>
                <Icon name="cube-outline" size={36} color="#fff" />
                <Text style={styles.smallCardTitle}>3D 建模</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.smallCard, {backgroundColor: '#FFE66D'}]} activeOpacity={0.8}>
              <View style={styles.smallCardContent}>
                <Icon name="videocam" size={36} color="#333" />
                <Text style={[styles.smallCardTitle, {color: '#333'}]}>视频调色</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem} onPress={() => onTabChange('home')}>
            <Icon name="home-outline" size={24} color={activeTab === 'home' ? '#6C63FF' : '#999'} />
            <Text style={[styles.navText, {color: activeTab === 'home' ? '#6C63FF' : '#999'}]}>首页</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => onTabChange('camera')}>
            <Icon name="camera" size={24} color={activeTab === 'camera' ? '#6C63FF' : '#999'} />
            <Text style={[styles.navText, {color: activeTab === 'camera' ? '#6C63FF' : '#999'}]}>拍照</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => onTabChange('assistant')}>
            <Icon name="sparkles-outline" size={24} color={activeTab === 'assistant' ? '#6C63FF' : '#999'} />
            <Text style={[styles.navText, {color: activeTab === 'assistant' ? '#6C63FF' : '#999'}]}>AI 助手</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => onTabChange('profile')}>
            <Icon name="person-outline" size={24} color={activeTab === 'profile' ? '#6C63FF' : '#999'} />
            <Text style={[styles.navText, {color: activeTab === 'profile' ? '#6C63FF' : '#999'}]}>我的</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  topBar: {
    paddingTop: 10,
    alignItems: 'center',
  },
  topBarLine: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 20,
  },
  title: {
    fontSize: 52,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 58,
  },
  subtitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 2,
    fontWeight: '500',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ECDC4',
    marginLeft: 8,
  },
  mainCard: {
    backgroundColor: '#FF6B6B',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  mainCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainCardTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 16,
  },
  smallCardsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 16,
  },
  smallCard: {
    flex: 1,
    borderRadius: 20,
    padding: 24,
    marginLeft: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  smallCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 12,
  },
  bottomPadding: {
    height: 100,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingBottom: 25,
    paddingTop: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
});

export default CameraScreen;
