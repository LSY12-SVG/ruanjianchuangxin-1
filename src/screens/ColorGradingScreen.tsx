import React, {useState, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {captureRef} from 'react-native-view-shot';
import {BasicLightModule} from '../components/colorGrading/BasicLightModule';
import {ColorBalanceModule} from '../components/colorGrading/ColorBalanceModule';
import {PresetSelector} from '../components/colorGrading/PresetSelector';
import {ImagePickerComponent} from '../components/image/ImagePickerComponent';
import {BeforeAfterViewer} from '../components/image/BeforeAfterViewer';
import {
  defaultColorGradingParams,
  BUILTIN_PRESETS,
  type ColorGradingParams,
  type ColorPreset,
} from '../types/colorGrading';
import {useImagePicker} from '../hooks/useImagePicker';
import {applyColorGradingToStyle} from '../utils/imageUtils';

type TabType = 'home' | 'camera' | 'assistant' | 'profile';

interface ColorGradingScreenProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const ColorGradingScreen: React.FC<ColorGradingScreenProps> = ({
  activeTab,
  onTabChange,
}) => {
  const [params, setParams] = useState<ColorGradingParams>(defaultColorGradingParams);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('preset_original');
  const [showComparison, setShowComparison] = useState(true);
  const viewRef = useRef<View>(null);

  // 使用图片选择 Hook
  const {
    selectedImage,
    isLoading,
    pickFromGallery,
    pickFromCamera,
    clearImage,
  } = useImagePicker({
    onImageSelected: (result) => {
      console.log('图片已选择:', result);
    },
    onImageError: (error) => {
      Alert.alert('错误', error);
    },
  });

  const handleBasicChange = useCallback((basic: ColorGradingParams['basic']) => {
    setParams(prev => ({...prev, basic}));
    if (selectedPresetId !== 'preset_original') {
      setSelectedPresetId('preset_original');
    }
  }, [selectedPresetId]);

  const handleColorBalanceChange = useCallback((colorBalance: ColorGradingParams['colorBalance']) => {
    setParams(prev => ({...prev, colorBalance}));
    if (selectedPresetId !== 'preset_original') {
      setSelectedPresetId('preset_original');
    }
  }, [selectedPresetId]);

  const handleSelectPreset = useCallback((preset: ColorPreset) => {
    setSelectedPresetId(preset.id);
    setParams(preset.params);
  }, []);

  const handleResetAll = () => {
    setParams(defaultColorGradingParams);
    setSelectedPresetId('preset_original');
  };

  const handleApplyAI = () => {
    // TODO: AI 智能调色入口
    Alert.alert('AI 智能调色', '该功能即将上线，敬请期待！');
    console.log('触发 AI 智能调色', params);
  };

  // 保存图片
  const handleSave = useCallback(async () => {
    if (!selectedImage?.success || !viewRef.current) {
      Alert.alert('提示', '请先选择一张图片');
      return;
    }

    try {
      // TODO: 使用原生图片处理实现真实的调色保存
      Alert.alert('提示', '图片保存功能开发中，当前仅用于演示预览效果');
    } catch (error) {
      console.error('保存图片失败:', error);
      Alert.alert('失败', '保存图片时出错');
    }
  }, [selectedImage]);

  // 显示对比开关
  const toggleComparison = () => {
    setShowComparison(!showComparison);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={['#2D5A5A', '#1A3A3A']}
        style={styles.gradient}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* 顶部横条 */}
          <View style={styles.topBar}>
            <View style={styles.topBarLine} />
          </View>

          {/* 标题区域 */}
          <View style={styles.header}>
            <Text style={styles.title}>Create</Text>
            <Text style={styles.title}>Magic</Text>
            <View style={styles.subtitleContainer}>
              <Text style={styles.subtitle}>STUDIO MODE</Text>
              <View style={styles.dot} />
            </View>
          </View>

          {/* AI 智能调色入口卡片 */}
          <TouchableOpacity style={styles.featureCard} onPress={handleApplyAI} activeOpacity={0.8}>
            <View style={styles.featureCardContent}>
              <Icon name="color-palette-outline" size={40} color="#fff" />
              <Text style={styles.featureCardTitle}>AI 智能调色</Text>
            </View>
            <View style={styles.aiButton}>
              <Icon name="sparkles" size={20} color="#fff" />
              <Text style={styles.aiButtonText}>智能优化</Text>
            </View>
          </TouchableOpacity>

          {/* 图片选择组件 */}
          <ImagePickerComponent
            selectedImage={selectedImage}
            isLoading={isLoading}
            onPickFromGallery={pickFromGallery}
            onPickFromCamera={pickFromCamera}
            onClearImage={clearImage}
          />

          {/* 如果已选择图片，显示预览和调色控件 */}
          {selectedImage?.success && selectedImage.uri && (
            <>
              {/* 图片预览与对比 */}
              <BeforeAfterViewer
                imageUri={selectedImage.uri}
                params={params}
                showComparison={showComparison}
                onToggleComparison={toggleComparison}
              />

              {/* 预设选择器 */}
              <Text style={styles.sectionTitle}>滤镜预设</Text>
              <PresetSelector
                presets={BUILTIN_PRESETS}
                selectedPresetId={selectedPresetId}
                onSelectPreset={handleSelectPreset}
              />

              {/* 参数调整模块 */}
              <Text style={styles.sectionTitle}>专业调整</Text>
              
              <BasicLightModule
                params={params.basic}
                onChange={handleBasicChange}
              />

              <ColorBalanceModule
                params={params.colorBalance}
                onChange={handleColorBalanceChange}
              />
            </>
          )}

          {/* 底部占位 */}
          <View style={styles.bottomPadding} />
        </ScrollView>

        {/* 底部操作栏 */}
        {selectedImage?.success && (
          <View style={styles.bottomActionBar}>
            <TouchableOpacity style={styles.actionButton} onPress={handleResetAll}>
              <Icon name="refresh-outline" size={20} color="#666" />
              <Text style={styles.actionButtonText}>重置</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleSave}>
              <Icon name="download-outline" size={20} color="#666" />
              <Text style={styles.actionButtonText}>保存</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.compareButton]} 
              onPress={toggleComparison}
            >
              <Icon name="layers-outline" size={20} color={showComparison ? '#6C63FF' : '#666'} />
              <Text style={[styles.actionButtonText, {color: showComparison ? '#6C63FF' : '#666'}]}>
                {showComparison ? '对比中' : '对比'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 底部导航栏 */}
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
  featureCard: {
    backgroundColor: '#FF6B6B',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 24,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  featureCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  featureCardTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 16,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  aiButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  bottomPadding: {
    height: 180,
  },
  bottomActionBar: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginHorizontal: 8,
  },
  compareButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  actionButtonText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
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

export default ColorGradingScreen;
