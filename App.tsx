import React, {useState} from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import CameraScreen from './src/screens/CameraScreen';

type TabType = 'home' | 'camera' | 'assistant' | 'profile';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen activeTab={activeTab} onTabChange={setActiveTab} />;
      case 'camera':
        return <CameraScreen activeTab={activeTab} onTabChange={setActiveTab} />;
      case 'assistant':
        return <HomeScreen activeTab={activeTab} onTabChange={setActiveTab} />;
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
