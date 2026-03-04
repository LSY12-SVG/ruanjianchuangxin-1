import React, {useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { Skia, Image as SkiaImage } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import {BasicLightModule} from '../components/colorGrading/BasicLightModule';
import {ColorBalanceModule} from '../components/colorGrading/ColorBalanceModule';
import {PresetSelector} from '../components/colorGrading/PresetSelector';
import {ImagePickerComponent} from '../components/image/ImagePickerComponent';
import {GPUBeforeAfterViewer} from '../components/image/GPUBeforeAfterViewer';
import {
  defaultColorGradingParams,
  BUILTIN_PRESETS,
  type ColorGradingParams,
  type ColorPreset,
} from '../types/colorGrading';
import {useImagePicker} from '../hooks/useImagePicker';

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
  const [loading, setLoading] = useState(false);

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

  // 使用 useMemo 缓存 Skia Image 对象
  const skImage = useMemo<SkImage | null>(() => {
    if (!selectedImage?.success || !selectedImage.uri) {
      return null;
    }

    try {
      // 如果有 base64 数据，优先使用
      if (selectedImage.base64 && selectedImage.base64.length > 0) {
        const base64String = selectedImage.base64.replace(/^data:image\/\w+;base64,/, '');
        const data = Skia.Data.fromBase64(base64String);
        if (data) {
          return Skia.Image.MakeImageFromEncoded(data);
        }
      }
      
      // 否则从 URI 加载（这个需要 native 支持）
      console.log('从 URI 加载图片:', selectedImage.uri);
      return null; // 暂时返回 null，使用 base64 方式
    } catch (error) {
      console.error('加载 Skia Image 失败:', error);
      return null;
    }
  }, [selectedImage?.uri, selectedImage?.base64, selectedImage?.success]);

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

  // 保存图片 - 使用 GPU 截图
  const handleSave = useCallback(async () => {
    if (!selectedImage?.success || !skImage) {
      Alert.alert('提示', '请先选择一张图片');
      return;
    }

    try {
      setLoading(true);
      
      // TODO: 使用 GPU 截图并保存
      // 这是后续优化的部分，需要使用 Skia 的 Surface 截图功能
      Alert.alert(
        '保存功能',
        'GPU 截图保存功能开发中...',
        [{text: '确定'}]
      );
    } catch (error) {
      console.error('保存图片失败:', error);
      Alert.alert('失败', '保存图片时出错，请重试');
    } finally {
      setLoading(false);
    }
  }, [selectedImage, skImage]);

  // 显示对比开关
  const toggleComparison = () => {
    setShowComparison(!showComparison);
  };

  if (!skImage && selectedImage?.success) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <LinearGradient
          colors={['#2D5A5A', '#1A3A3A']}
          style={styles.gradient}
        >
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>加载图片中...</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

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
          {selectedImage?.success && skImage && (
            <>
              {/* 图片预览与对比 - 使用 GPU 实时渲染 */}
              <GPUBeforeAfterViewer
                image={skImage}
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
        {selectedImage?.success && skImage && (
          <View style={styles.bottomActionBar}>
            <TouchableOpacity style={styles.actionButton} onPress={handleResetAll}>
              <Icon name="refresh-outline" size={20} color="#666" />
              <Text style={styles.actionButtonText}>重置</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.saveButton]} 
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#666" />
              ) : (
                <>
                  <Icon name="download-outline" size={20} color="#666" />
                  <Text style={styles.actionButtonText}>保存</Text>
                </>
              )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  topBar: {
    height: 40,
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  topBarLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    width: '100%',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6C63FF',
    marginLeft: 8,
  },
  featureCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 15,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featureCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureCardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(108, 99, 255, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  aiButtonText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 6,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
    marginLeft: 20,
  },
  bottomPadding: {
    height: 100,
  },
  bottomActionBar: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginHorizontal: 6,
  },
  saveButton: {
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
  },
  compareButton: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  actionButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingTop: 10,
    paddingBottom: 25,
    paddingHorizontal: 20,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
  },
  navText: {
    fontSize: 12,
    marginTop: 4,
  },
});

export default ColorGradingScreen;
