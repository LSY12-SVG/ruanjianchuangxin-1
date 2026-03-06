import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, StatusBar, ScrollView } from 'react-native';
import AIColorTuning from './AIColorTuning';
import ThreeDModeling from './ThreeDModeling';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [showAIColorTuning, setShowAIColorTuning] = useState(false);
  const [showThreeDModeling, setShowThreeDModeling] = useState(false);

  // 渲染逻辑
  const renderContent = () => {
    if (showAIColorTuning) return <AIColorTuning onBack={() => setShowAIColorTuning(false)} />;
    if (showThreeDModeling) return <ThreeDModeling onBack={() => setShowThreeDModeling(false)} />;

    switch (activeTab) {
      case 'home': return renderHomeScreen();
      case 'capture': return renderCaptureScreen();
      case 'ai': return <View style={styles.center}><Text style={styles.whiteText}>AI 助手正在连接...</Text></View>;
      case 'profile': return <View style={styles.center}><Text style={styles.whiteText}>个人中心</Text></View>;
      default: return renderHomeScreen();
    }
  };

  const renderHomeScreen = () => (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Vision Genie</Text></View>
      <View style={styles.content}>
        <TouchableOpacity style={styles.card1}><Text style={styles.cardTitle1}>今日 AI 艺术家</Text></TouchableOpacity>
        <TouchableOpacity style={styles.card2}><Text style={styles.cardTitle2}>心情树洞</Text></TouchableOpacity>
      </View>
    </View>
  );

  const renderCaptureScreen = () => (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>创作中心</Text></View>
      <View style={styles.content}>
        <TouchableOpacity style={styles.captureCard1} onPress={() => setShowAIColorTuning(true)}>
          <Text style={styles.captureCardTitle}>🎨 AI 调色大师</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.captureCard2} onPress={() => setShowThreeDModeling(true)}>
          <Text style={styles.captureCardTitle}>📦 3D 建模</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.mainContainer}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1 }}>{renderContent()}</View>
      
      {/* 底部导航栏：四个按钮 */}
      {!showAIColorTuning && !showThreeDModeling && (
        <View style={styles.tabBar}>
          {[
            { id: 'home', label: '首页' },
            { id: 'capture', label: '创作' },
            { id: 'ai', label: 'AI助手' },
            { id: 'profile', label: '我的' }
          ].map((item) => (
            <TouchableOpacity 
              key={item.id}
              onPress={() => setActiveTab(item.id)} 
              style={styles.tabItem}
            >
              <Text style={[styles.tabText, activeTab === item.id && styles.activeTabText]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#6a11cb' },
  container: { flex: 1 },
  header: { paddingTop: 50, paddingLeft: 30, paddingBottom: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: 'white' },
  content: { paddingHorizontal: 20 },
  card1: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 30, marginBottom: 15 },
  cardTitle1: { fontSize: 20, color: 'white' },
  card2: { backgroundColor: 'white', borderRadius: 20, padding: 30 },
  cardTitle2: { fontSize: 20, color: '#6a11cb' },
  captureCard1: { backgroundColor: '#ff4d4d', borderRadius: 20, padding: 30, marginBottom: 15 },
  captureCard2: { backgroundColor: '#4dd0e1', borderRadius: 20, padding: 30 },
  captureCardTitle: { fontSize: 18, color: 'white', textAlign: 'center' },
  tabBar: { 
    flexDirection: 'row', 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    paddingTop: 15, 
    paddingBottom: 35, // 适配全面屏底部手势条
    justifyContent: 'space-around' 
  },
  tabItem: { alignItems: 'center', flex: 1 },
  tabText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  activeTabText: { color: 'white', fontWeight: 'bold' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  whiteText: { color: 'white', fontSize: 18 }
});