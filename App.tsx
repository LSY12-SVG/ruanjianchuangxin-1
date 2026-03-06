import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import AIColorTuning from './AIColorTuning';
import ThreeDModeling from './ThreeDModeling';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [showAIColorTuning, setShowAIColorTuning] = useState(false);
  const [showThreeDModeling, setShowThreeDModeling] = useState(false);

  const renderHomeScreen = () => (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Vision Genie</Text>
        <Text style={styles.subtitle}>MAGIC DISCOVERY •</Text>
      </View>
      
      <View style={styles.content}>
        <TouchableOpacity style={styles.card1}>
          <Text style={styles.cardTitle1}>今日 AI 艺术家</Text>
          <View style={styles.playIcon}>
            <Text style={styles.playIconText}>▶</Text>
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.card2}>
          <Text style={styles.cardTitle2}>心情树洞</Text>
          <Text style={styles.cardSubtitle}>匿名倾诉, AI 暖心回应</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCaptureScreen = () => (
    <View style={styles.captureContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Magic</Text>
        <Text style={styles.subtitle}>STUDIO MODE •</Text>
      </View>
      
      <View style={styles.content}>
        <TouchableOpacity 
          style={styles.captureCard1}
          onPress={() => setShowAIColorTuning(true)}
        >
          <Text style={styles.captureCardIcon}>🎨</Text>
          <Text style={styles.captureCardTitle}>AI 智能调色</Text>
        </TouchableOpacity>
        
        <View style={styles.captureCardRow}>
          <TouchableOpacity 
            style={styles.captureCard2}
            onPress={() => setShowThreeDModeling(true)}
          >
            <Text style={styles.captureCardIcon}>📦</Text>
            <Text style={styles.captureCardTitle}>3D 建模</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.captureCard3}>
            <Text style={styles.captureCardIcon}>🎬</Text>
            <Text style={styles.captureCardTitle}>视频调色</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {showAIColorTuning ? (
        <AIColorTuning onBack={() => setShowAIColorTuning(false)} />
      ) : showThreeDModeling ? (
        <ThreeDModeling onBack={() => setShowThreeDModeling(false)} />
      ) : (
        <>
          {activeTab === 'home' && renderHomeScreen()}
          {activeTab === 'capture' && renderCaptureScreen()}
          {activeTab === 'ai' && (
            <View style={styles.container}>
              <View style={styles.header}>
                <Text style={styles.title}>AI 助手</Text>
              </View>
            </View>
          )}
          {activeTab === 'profile' && (
            <View style={styles.container}>
              <View style={styles.header}>
                <Text style={styles.title}>我的</Text>
              </View>
            </View>
          )}
          
          <View style={styles.tabBar}>
            <TouchableOpacity 
              style={[styles.tabItem, activeTab === 'home' && styles.activeTabItem]}
              onPress={() => setActiveTab('home')}
            >
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>🏠</Text>
              </View>
              <Text style={[styles.tabText, activeTab === 'home' && styles.activeTabText]}>首页</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tabItem, activeTab === 'capture' && styles.activeTabItem]}
              onPress={() => setActiveTab('capture')}
            >
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>📷</Text>
              </View>
              <Text style={[styles.tabText, activeTab === 'capture' && styles.activeTabText]}>拍照</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tabItem, activeTab === 'ai' && styles.activeTabItem]}
              onPress={() => setActiveTab('ai')}
            >
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>✨</Text>
              </View>
              <Text style={[styles.tabText, activeTab === 'ai' && styles.activeTabText]}>AI助手</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tabItem, activeTab === 'profile' && styles.activeTabItem]}
              onPress={() => setActiveTab('profile')}
            >
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>👤</Text>
              </View>
              <Text style={[styles.tabText, activeTab === 'profile' && styles.activeTabText]}>我的</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#6a11cb',
  },
  captureContainer: {
    flex: 1,
    backgroundColor: '#1a365d',
  },
  header: {
    paddingTop: 50,
    paddingLeft: 30,
    paddingBottom: 30,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: 'center',
  },
  card1: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    padding: 30,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card2: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 30,
  },
  cardTitle1: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  cardTitle2: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  cardSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 5,
  },
  playIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconText: {
    color: '#6a11cb',
    fontSize: 16,
    fontWeight: 'bold',
  },
  captureCard1: {
    backgroundColor: '#ff4d4d',
    borderRadius: 20,
    padding: 40,
    marginBottom: 20,
    alignItems: 'center',
  },
  captureCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  captureCard2: {
    backgroundColor: '#4dd0e1',
    borderRadius: 20,
    padding: 30,
    width: '48%',
    alignItems: 'center',
  },
  captureCard3: {
    backgroundColor: '#ffeb3b',
    borderRadius: 20,
    padding: 30,
    width: '48%',
    alignItems: 'center',
  },
  captureCardIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  captureCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  tabItem: {
    alignItems: 'center',
  },
  activeTabItem: {
    // 可以添加选中状态的样式
  },
  tabIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconText: {
    fontSize: 20,
  },
  tabText: {
    color: 'white',
    fontSize: 12,
    marginTop: 5,
  },
  activeTabText: {
    color: '#ffeb3b',
  },
});
