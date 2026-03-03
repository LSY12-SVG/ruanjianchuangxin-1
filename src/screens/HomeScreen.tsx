import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

const {width} = Dimensions.get('window');

type TabType = 'home' | 'camera' | 'assistant' | 'profile';

interface HomeScreenProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({activeTab, onTabChange}) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={['#4A3B7C', '#2D1F4E']}
        style={styles.gradient}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View style={styles.topBarLine} />
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Vision</Text>
            <Text style={styles.title}>Genie</Text>
            <View style={styles.subtitleContainer}>
              <Text style={styles.subtitle}>MAGIC DISCOVERY</Text>
              <View style={styles.dot} />
            </View>
          </View>

          <TouchableOpacity style={styles.mainCard} activeOpacity={0.8}>
            <Text style={styles.mainCardTitle}>今日 AI 艺术家</Text>
            <View style={styles.playButton}>
              <Icon name="play" size={24} color="#fff" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryCard} activeOpacity={0.8}>
            <Text style={styles.secondaryCardTitle}>心情树洞</Text>
            <Text style={styles.secondaryCardSubtitle}>匿名倾诉，AI 暖心回应</Text>
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
        </ScrollView>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem} onPress={() => onTabChange('home')}>
            <Icon name="home" size={24} color={activeTab === 'home' ? '#6C63FF' : '#999'} />
            <Text style={[styles.navText, {color: activeTab === 'home' ? '#6C63FF' : '#999'}]}>首页</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => onTabChange('camera')}>
            <Icon name="camera-outline" size={24} color={activeTab === 'camera' ? '#6C63FF' : '#999'} />
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
    backgroundColor: '#9B8DD8',
    marginLeft: 8,
  },
  mainCard: {
    backgroundColor: '#A68BFF',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 24,
    padding: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  mainCardTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
  },
  secondaryCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  secondaryCardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  secondaryCardSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
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

export default HomeScreen;
