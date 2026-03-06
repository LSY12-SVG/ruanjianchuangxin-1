import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { launchImageLibrary, ImagePickerResponse, Asset } from 'react-native-image-picker';
import { SiliconFlowService } from './SiliconFlowService';
import { SILICONFLOW_API_KEY } from './config/siliconflow';

// Placeholder for Tripo API Key - in production this should be in a secure config
const TRIPO_API_KEY = 'mock-key'; // Replace with actual key or use 'mock-key' for demo

interface ThreeDModelingProps {
  onBack: () => void;
}

export default function ThreeDModeling({ onBack }: ThreeDModelingProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultModelUrl, setResultModelUrl] = useState<string | null>(null);

  const requestPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          {
            title: "Storage Permission",
            message: "App needs access to your storage to select photos",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const handleImageUpload = async () => {
    const hasPermission = await requestPermission();
    if (!hasPermission) {
      // For Android 13+, READ_MEDIA_IMAGES might be needed, but for now basic check
      // simplistic fallback
    }

    const options = {
      mediaType: 'photo' as const,
      selectionLimit: 1,
      includeBase64: false,
    };

    try {
      const result: ImagePickerResponse = await launchImageLibrary(options);
      
      if (result.didCancel) {
        console.log('User cancelled image picker');
      } else if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Failed to select image');
      } else if (result.assets && result.assets.length > 0) {
        const asset: Asset = result.assets[0];
        if (asset.uri) {
          setSelectedImage(asset.uri);
          setResultModelUrl(null);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'An error occurred while picking the image');
    }
  };

  const handleGenerate3D = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setResultModelUrl(null);

    try {
      const service = SiliconFlowService.getInstance(SILICONFLOW_API_KEY);
      service.setTripoApiKey(TRIPO_API_KEY);

      // Start the task
      const taskId = await service.create3DModelFromImage(selectedImage);
      console.log('3D Task started:', taskId);

      // Poll for status
      const checkStatus = async () => {
        try {
          const result = await service.check3DTaskStatus(taskId);
          console.log('Task Status:', result.status, result.progress);

          if (result.status === 'success' && result.output?.model_url) {
            setIsProcessing(false);
            setResultModelUrl(result.output.model_url);
            Alert.alert('Success', '3D Model Generated Successfully!');
          } else if (result.status === 'failed' || result.status === 'cancelled') {
            setIsProcessing(false);
            Alert.alert('Error', `Generation Failed: ${result.message || 'Unknown error'}`);
          } else {
            // Continue polling
            setTimeout(checkStatus, 2000);
          }
        } catch (error) {
          console.error('Status Check Error:', error);
          setIsProcessing(false);
          Alert.alert('Error', 'Failed to check task status');
        }
      };

      // Start polling
      setTimeout(checkStatus, 2000);

    } catch (error) {
      console.error('Generation Error:', error);
      setIsProcessing(false);
      Alert.alert('Error', 'Failed to start 3D generation. Check logs.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>3D Modeling (Misako)</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.imageContainer}>
          {selectedImage ? (
            <Image source={{ uri: selectedImage }} style={styles.previewImage} resizeMode="contain" />
          ) : (
            <TouchableOpacity style={styles.uploadPlaceholder} onPress={handleImageUpload}>
              <Text style={styles.uploadText}>Tap to Upload 2D Image</Text>
            </TouchableOpacity>
          )}
        </View>

        {selectedImage && (
          <TouchableOpacity 
            style={[styles.generateButton, isProcessing && styles.disabledButton]}
            onPress={handleGenerate3D}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.generateButtonText}>Generate 3D Model</Text>
            )}
          </TouchableOpacity>
        )}
        
        {resultModelUrl && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultText}>3D Model Generated!</Text>
            {/* 3D Viewer would go here */}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
  },
  backButton: {
    padding: 10,
    marginRight: 10,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 24,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  uploadPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadText: {
    color: '#888',
    fontSize: 16,
  },
  generateButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 25,
    width: '80%',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#555',
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  resultContainer: {
    marginTop: 30,
    alignItems: 'center',
  },
  resultText: {
    color: '#4CAF50',
    fontSize: 18,
    marginBottom: 10,
  },
});
