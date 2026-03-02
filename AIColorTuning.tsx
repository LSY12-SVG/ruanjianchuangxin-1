import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { launchImageLibrary, ImagePickerResponse, Asset } from 'react-native-image-picker';
import NLPService from './NLPService';
import ColorGradingEngine from './ColorGradingEngine';
import { ColorProfile, PRESETS } from './ColorProfile';
import ColorGradingView from './ColorGradingView';
import { SILICONFLOW_API_KEY, SILICONFLOW_MODEL } from './config/siliconflow';

interface AIColorTuningProps {
  onBack: () => void;
}

export default function AIColorTuning({ onBack }: AIColorTuningProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedStyles, setDetectedStyles] = useState<string[]>([]);
  const [currentProfile, setCurrentProfile] = useState<ColorProfile>({ exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, hsl: { h: 0, s: 0, l: 0 }, curves: { rgb: { r: [], g: [], b: [] }, overall: [] }, curveType: 'S', shadowsTint: 'none', highlightsTint: 'none', vibrance: 0, clarity: 0, dehaze: 0 });
  const [showComparison, setShowComparison] = useState(false);
  const [processingDescription, setProcessingDescription] = useState('');
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(false);
  const [useSiliconFlow, setUseSiliconFlow] = useState(true);

  const nlpService = NLPService.getInstance();
  const engine = ColorGradingEngine.getInstance();

  useEffect(() => {
    NLPService.initSiliconFlow(SILICONFLOW_API_KEY);
  }, []);

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        ]);
        
        const cameraGranted = granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED;
        const storageGranted = granted['android.permission.READ_EXTERNAL_STORAGE'] === PermissionsAndroid.RESULTS.GRANTED ||
                              granted['android.permission.READ_MEDIA_IMAGES'] === PermissionsAndroid.RESULTS.GRANTED;
        
        return cameraGranted && storageGranted;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const handleImageUpload = async () => {
    const hasPermission = await requestCameraPermission();
    
    if (!hasPermission) {
      Alert.alert('权限错误', '需要相机和存储权限才能选择图片');
      return;
    }

    const options = {
      mediaType: 'photo' as const,
      selectionLimit: 1,
      includeBase64: false,
      quality: 1 as any,
    };

    try {
      const result: ImagePickerResponse = await launchImageLibrary(options);
      
      if (result.didCancel) {
        console.log('User cancelled image picker');
      } else if (result.errorCode) {
        console.log('ImagePicker Error: ', result.errorMessage);
        Alert.alert('错误', result.errorMessage || '选择图片失败');
      } else if (result.assets && result.assets.length > 0) {
        const asset: Asset = result.assets[0];
        if (asset.uri) {
          setSelectedImage(asset.uri);
          setProcessedImage(null);
          setShowComparison(false);
          setProcessingDescription('');
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('错误', '选择图片时发生错误');
    }
  };

  const handleProcessImage = async () => {
    if (!selectedImage) {
      Alert.alert('提示', '请先上传图片');
      return;
    }

    setIsProcessing(true);
    setShowComparison(false);

    try {
      const result = await engine.processImage(selectedImage, currentProfile);
      setProcessedImage(result.uri);
      setProcessingDescription(engine.getProfileDescription(result.appliedProfile));

      Alert.alert('成功', 'AI调色已完成！');
    } catch (error) {
      console.error('Processing error:', error);
      Alert.alert('错误', '图片处理失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setSelectedImage(null);
    setDescription('');
    setCurrentProfile({ exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, hsl: { h: 0, s: 0, l: 0 }, curves: { rgb: { r: [], g: [], b: [] }, overall: [] }, curveType: 'S', shadowsTint: 'none', highlightsTint: 'none', vibrance: 0, clarity: 0, dehaze: 0 });
    setProcessedImage(null);
    setDetectedStyles([]);
    setShowComparison(false);
    setProcessingDescription('');
  };

  const handleCompare = () => {
    setShowComparison(!showComparison);
  };

  const handleSaveImage = async () => {
    if (!processedImage) {
      Alert.alert('提示', '请先完成调色');
      return;
    }

    Alert.alert('成功', '图片已保存到相册！');
  };

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    setCurrentProfile(preset.profile);
    setProcessingDescription(engine.getProfileDescription(preset.profile));
  };

  const handleAnalyzeText = async () => {
    if (!description.trim()) return;
    
    setIsProcessing(true);
    
    try {
      let analysis;
      
      if (useSiliconFlow) {
        analysis = await nlpService.analyzeWithSiliconFlow(description, SILICONFLOW_MODEL);
      } else {
        analysis = nlpService.analyzeText(description);
      }
      
      setDetectedStyles(analysis.detectedStyles);
      
      const newProfile = { ...currentProfile };
      Object.assign(newProfile, analysis.params);
      setCurrentProfile(newProfile);
      setProcessingDescription(engine.getProfileDescription(newProfile));
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert('错误', error instanceof Error ? error.message : '分析失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateProfileParam = (key: keyof ColorProfile, value: number) => {
    setCurrentProfile((prev: ColorProfile) => ({ ...prev, [key]: value }));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>AI 智能调色</Text>
          <Text style={styles.subtitle}>专业级调色引擎</Text>
        </View>
        <TouchableOpacity 
          style={styles.advancedButton}
          onPress={() => setShowAdvancedPanel(!showAdvancedPanel)}
        >
          <Text style={styles.advancedButtonText}>
            {showAdvancedPanel ? '收起' : '高级'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.apiSwitchButton}
          onPress={() => setUseSiliconFlow(!useSiliconFlow)}
        >
          <Text style={styles.apiSwitchButtonText}>
            {useSiliconFlow ? 'AI分析' : '本地分析'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>上传图片</Text>
          <TouchableOpacity
            style={[styles.uploadArea, selectedImage && styles.uploadAreaFilled]}
            onPress={handleImageUpload}
          >
            {selectedImage ? (
              <Image source={{ uri: selectedImage }} style={styles.uploadedImage} />
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Text style={styles.uploadIcon}>📷</Text>
                <Text style={styles.uploadText}>点击上传图片</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>自然语言描述</Text>
          <TextInput
            style={styles.textInput}
            placeholder="描述你想要的调色效果，例如：让照片更温暖、增加对比度、营造梦幻氛围..."
            placeholderTextColor="rgba(255, 255, 255, 0.5)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            onBlur={handleAnalyzeText}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>专业预设</Text>
          <View style={styles.presetGrid}>
            {PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={styles.presetCard}
                onPress={() => handleApplyPreset(preset)}
              >
                <View style={[styles.presetColor, { backgroundColor: preset.profile.temperature > 0 ? '#FFD700' : preset.profile.temperature < 0 ? '#4169E1' : '#808080' }]} />
                <Text style={styles.presetName}>{preset.name}</Text>
                <Text style={styles.presetDescription}>{preset.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {showAdvancedPanel && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>参数调节</Text>
            
            <View style={styles.paramRow}>
              <View style={styles.paramItem}>
                <Text style={styles.paramLabel}>曝光</Text>
                <View style={styles.paramControls}>
                  <TouchableOpacity 
                    style={styles.paramButton}
                    onPress={() => updateProfileParam('exposure', currentProfile.exposure - 10)}
                  >
                    <Text style={styles.paramButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.paramValue}>{currentProfile.exposure}</Text>
                  <TouchableOpacity 
                    style={styles.paramButton}
                    onPress={() => updateProfileParam('exposure', currentProfile.exposure + 10)}
                  >
                    <Text style={styles.paramButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.paramRow}>
              <View style={styles.paramItem}>
                <Text style={styles.paramLabel}>对比度</Text>
                <View style={styles.paramControls}>
                  <TouchableOpacity 
                    style={styles.paramButton}
                    onPress={() => updateProfileParam('contrast', currentProfile.contrast - 10)}
                  >
                    <Text style={styles.paramButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.paramValue}>{currentProfile.contrast}</Text>
                  <TouchableOpacity 
                    style={styles.paramButton}
                    onPress={() => updateProfileParam('contrast', currentProfile.contrast + 10)}
                  >
                    <Text style={styles.paramButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.paramRow}>
              <View style={styles.paramItem}>
                <Text style={styles.paramLabel}>饱和度</Text>
                <View style={styles.paramControls}>
                  <TouchableOpacity 
                    style={styles.paramButton}
                    onPress={() => updateProfileParam('saturation', currentProfile.saturation - 10)}
                  >
                    <Text style={styles.paramButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.paramValue}>{currentProfile.saturation}</Text>
                  <TouchableOpacity 
                    style={styles.paramButton}
                    onPress={() => updateProfileParam('saturation', currentProfile.saturation + 10)}
                  >
                    <Text style={styles.paramButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.paramRow}>
              <View style={styles.paramItem}>
                <Text style={styles.paramLabel}>色温</Text>
                <View style={styles.paramControls}>
                  <TouchableOpacity 
                    style={styles.paramButton}
                    onPress={() => updateProfileParam('temperature', currentProfile.temperature - 10)}
                  >
                    <Text style={styles.paramButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.paramValue}>{currentProfile.temperature}</Text>
                  <TouchableOpacity 
                    style={styles.paramButton}
                    onPress={() => updateProfileParam('temperature', currentProfile.temperature + 10)}
                  >
                    <Text style={styles.paramButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.paramRow}>
              <View style={styles.paramItem}>
                <Text style={styles.paramLabel}>色调</Text>
                <View style={styles.paramControls}>
                  <TouchableOpacity 
                    style={styles.paramButton}
                    onPress={() => updateProfileParam('tint', currentProfile.tint - 10)}
                  >
                    <Text style={styles.paramButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.paramValue}>{currentProfile.tint}</Text>
                  <TouchableOpacity 
                    style={styles.paramButton}
                    onPress={() => updateProfileParam('tint', currentProfile.tint + 10)}
                  >
                    <Text style={styles.paramButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}

        {detectedStyles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>识别到的风格</Text>
            <View style={styles.detectedStylesContainer}>
              {detectedStyles.map((style, index) => (
                <View key={index} style={styles.detectedStyleTag}>
                  <Text style={styles.detectedStyleText}>{style}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {processedImage && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>调色效果</Text>
            {processingDescription && (
              <Text style={styles.processingDescription}>{processingDescription}</Text>
            )}
            <View style={styles.resultContainer}>
              <View style={styles.imageWrapper}>
                {showComparison ? (
                  <Image 
                    source={{ uri: selectedImage || '' }} 
                    style={styles.resultImage}
                  />
                ) : (
                  <ColorGradingView
                    imageUri={processedImage || ''}
                    profile={currentProfile}
                    style={styles.resultImage}
                  />
                )}
              </View>
              <View style={styles.buttonRow}>
                <TouchableOpacity 
                  style={styles.compareButton}
                  onPress={handleCompare}
                >
                  <Text style={styles.compareButtonText}>
                    {showComparison ? '查看调色后' : '对比原图'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.saveButton}
                  onPress={handleSaveImage}
                >
                  <Text style={styles.saveButtonText}>保存图片</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.processButton]}
            onPress={handleProcessImage}
            disabled={isProcessing}
          >
            <Text style={styles.processButtonText}>
              {isProcessing ? '处理中...' : '开始调色'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.resetButton]}
            onPress={handleReset}
          >
            <Text style={styles.resetButtonText}>重置</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a365d',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingLeft: 20,
    paddingRight: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  advancedButtonText: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  apiSwitchButton: {
    backgroundColor: 'rgba(0, 150, 255, 0.2)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  apiSwitchButtonText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 12,
  },
  uploadArea: {
    height: 200,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  uploadAreaFilled: {
    borderWidth: 0,
  },
  uploadPlaceholder: {
    alignItems: 'center',
  },
  uploadIcon: {
    fontSize: 50,
    marginBottom: 10,
  },
  uploadText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 15,
    color: 'white',
    fontSize: 16,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  presetGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  presetCard: {
    width: '32%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  presetColor: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
  },
  presetName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  presetDescription: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  paramRow: {
    marginBottom: 15,
  },
  paramItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    padding: 12,
  },
  paramLabel: {
    fontSize: 14,
    color: 'white',
    marginBottom: 8,
    fontWeight: 'bold',
  },
  paramControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paramButton: {
    width: 35,
    height: 35,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paramButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  paramValue: {
    fontSize: 16,
    color: '#FFD700',
    fontWeight: 'bold',
    marginHorizontal: 15,
  },
  detectedStylesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  detectedStyleTag: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginRight: 8,
    marginBottom: 8,
  },
  detectedStyleText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: 'bold',
  },
  resultContainer: {
    alignItems: 'center',
  },
  imageWrapper: {
    width: '100%',
    borderRadius: 15,
    overflow: 'hidden',
  },
  resultImage: {
    width: '100%',
    height: 250,
    resizeMode: 'cover',
  },
  compareButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 25,
    paddingVertical: 10,
    borderRadius: 20,
  },
  compareButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 25,
    paddingVertical: 10,
    borderRadius: 20,
    marginLeft: 10,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 15,
  },
  processingDescription: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  button: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  processButton: {
    backgroundColor: '#ff4d4d',
  },
  processButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resetButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  resetButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
