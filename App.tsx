import React, {useState} from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import CameraScreen from './src/screens/CameraScreen';
import ColorGradingScreen from './src/screens/ColorGradingScreen';
import GPUColorGradingScreen from './src/screens/GPUColorGradingScreen';

type TabType = 'home' | 'camera' | 'assistant' | 'profile';
type ColorGradingMode = 'cpu' | 'gpu';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [colorGradingMode, setColorGradingMode] = useState<ColorGradingMode>('gpu');

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen activeTab={activeTab} onTabChange={setActiveTab} />;
      case 'camera':
        return <CameraScreen activeTab={activeTab} onTabChange={setActiveTab} />;
      case 'assistant':
        // AI 助手 - 使用 GPU 调色屏幕
        return (
          <GPUColorGradingScreen
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        );
      case 'profile':
        return <HomeScreen activeTab={activeTab} onTabChange={setActiveTab} />;
      default:
        return <HomeScreen activeTab={activeTab} onTabChange={setActiveTab} />;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" translucent />
      {renderScreen()}
    </SafeAreaProvider>
  );
}

export default App;
