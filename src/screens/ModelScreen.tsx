import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {WebView} from 'react-native-webview';
import {useImagePicker} from '../hooks/useImagePicker';
import {
  formatApiErrorMessage,
  modelingApi,
  type CaptureSessionResponse,
  type ModelingJobResponse,
  type ModelingModelAssetResponse,
  type ModuleCapabilityItem,
} from '../modules/api';
import {PageHero} from '../components/app/PageHero';
import {HERO_MODEL} from '../assets/design';
import {canvasText, cardSurfaceBlue, glassShadow} from '../theme/canvasDesign';

type Mode = 'job' | 'capture';

const ANGLE_TAGS = [
  'front',
  'front_right',
  'right',
  'back_right',
  'back',
  'back_left',
  'left',
  'front_left',
];

const jobProgressByStatus: Record<ModelingJobResponse['status'], number> = {
  queued: 18,
  processing: 64,
  succeeded: 100,
  failed: 100,
  expired: 100,
};

const buildModelViewerHtml = (url: string): string => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: #0b1220; overflow: hidden; }
      model-viewer { width: 100%; height: 100%; --progress-bar-color: #6FE7FF; }
    </style>
  </head>
  <body>
    <model-viewer
      src="${url}"
      camera-controls
      auto-rotate
      shadow-intensity="1"
      exposure="1"
      ar
      loading="eager">
    </model-viewer>
  </body>
</html>`;

interface ModelScreenProps {
  capabilities: ModuleCapabilityItem[];
}

export const ModelScreen: React.FC<ModelScreenProps> = ({capabilities}) => {
  const [mode, setMode] = useState<Mode>('job');
  const [job, setJob] = useState<ModelingJobResponse | null>(null);
  const [jobAssetUrl, setJobAssetUrl] = useState('');
  const [session, setSession] = useState<CaptureSessionResponse | null>(null);
  const [captureTaskId, setCaptureTaskId] = useState('');
  const [captureModel, setCaptureModel] = useState<ModelingModelAssetResponse | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const jobPicker = useImagePicker({
    onImageError: message => setErrorText(message),
  });
  const capturePicker = useImagePicker({
    onImageError: message => setErrorText(message),
  });

  const modelingCapability = capabilities.find(item => item.module === 'modeling');

  useEffect(() => {
    if (!job?.taskId) {
      return;
    }
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'expired') {
      return;
    }
    const timer = setInterval(() => {
      modelingApi
        .getJob(job.taskId)
        .then(next => {
          setJob(next);
          if (next.status === 'succeeded') {
            setJobAssetUrl(
              next.downloadUrl || next.previewUrl || next.viewerFiles?.[0]?.url || '',
            );
          }
        })
        .catch(error => {
          setErrorText(formatApiErrorMessage(error, '任务轮询失败'));
        });
    }, Number(job.pollAfterMs || 5000));
    return () => clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (!captureTaskId) {
      return;
    }
    const timer = setInterval(() => {
      modelingApi
        .getJob(captureTaskId)
        .then(next => {
          if (next.status === 'succeeded' || next.status === 'failed' || next.status === 'expired') {
            clearInterval(timer);
          }
          if (next.status === 'succeeded') {
            modelingApi
              .getModelAsset(next.taskId)
              .then(asset => setCaptureModel(asset))
              .catch(error => setErrorText(formatApiErrorMessage(error, '模型拉取失败')));
          }
        })
        .catch(error => setErrorText(formatApiErrorMessage(error, '捕捉任务轮询失败')));
    }, 5000);
    return () => clearInterval(timer);
  }, [captureTaskId]);

  const viewerUrl = useMemo(() => {
    const candidate = jobAssetUrl || captureModel?.glbUrl || '';
    return candidate;
  }, [jobAssetUrl, captureModel]);

  const createJob = async () => {
    if (!jobPicker.selectedImage?.success || !jobPicker.selectedImage.uri) {
      Alert.alert('请先选择图片');
      return;
    }
    try {
      setLoading(true);
      setErrorText('');
      const created = await modelingApi.createJob({
        uri: jobPicker.selectedImage.uri,
        type: jobPicker.selectedImage.type,
        fileName: jobPicker.selectedImage.fileName,
      });
      setJob(created);
      setJobAssetUrl('');
    } catch (error) {
      const message = formatApiErrorMessage(error, '创建任务失败');
      setErrorText(message);
      Alert.alert('创建任务失败', message);
    } finally {
      setLoading(false);
    }
  };

  const loadJobAsset = async () => {
    if (!job?.taskId) {
      return;
    }
    try {
      setLoading(true);
      const latest = await modelingApi.getJob(job.taskId);
      setJob(latest);
      if (latest.status !== 'succeeded') {
        throw new Error(`任务尚未完成，当前状态: ${latest.status}`);
      }
      const nextUrl = latest.downloadUrl || latest.previewUrl || latest.viewerFiles?.[0]?.url || '';
      if (!nextUrl) {
        throw new Error('任务已完成但没有可展示资产');
      }
      setJobAssetUrl(nextUrl);
      setViewerVisible(true);
    } catch (error) {
      const message = formatApiErrorMessage(error, '模型资产获取失败');
      setErrorText(message);
      Alert.alert('模型资产获取失败', message);
    } finally {
      setLoading(false);
    }
  };

  const startCaptureSession = async () => {
    try {
      setLoading(true);
      const created = await modelingApi.createCaptureSession();
      setSession(created);
      setCaptureTaskId('');
      setCaptureModel(null);
    } catch (error) {
      const message = formatApiErrorMessage(error, '创建捕捉会话失败');
      setErrorText(message);
      Alert.alert('创建捕捉会话失败', message);
    } finally {
      setLoading(false);
    }
  };

  const addCaptureFrame = async () => {
    if (!session?.id) {
      Alert.alert('请先创建捕捉会话');
      return;
    }
    const result = await capturePicker.pickFromGallery();
    if (!result.success || !result.uri) {
      return;
    }
    try {
      setLoading(true);
      const angleTag = ANGLE_TAGS[session.acceptedFrameCount % ANGLE_TAGS.length];
      const payload = await modelingApi.uploadCaptureFrame(session.id, {
        uri: result.uri,
        type: result.type,
        fileName: result.fileName,
        angleTag,
        width: result.width,
        height: result.height,
        fileSize: result.fileSize,
      });
      setSession(payload.session);
    } catch (error) {
      const message = formatApiErrorMessage(error, '上传帧失败');
      setErrorText(message);
      Alert.alert('上传帧失败', message);
    } finally {
      setLoading(false);
    }
  };

  const generateCaptureModel = async () => {
    if (!session?.id) {
      return;
    }
    try {
      setLoading(true);
      const result = await modelingApi.generateCapture(session.id);
      setCaptureTaskId(result.taskId);
    } catch (error) {
      const message = formatApiErrorMessage(error, '生成失败');
      setErrorText(message);
      Alert.alert('生成失败', message);
    } finally {
      setLoading(false);
    }
  };

  const openDownload = async () => {
    const url = jobAssetUrl || captureModel?.glbUrl || job?.downloadUrl || '';
    if (!url) {
      Alert.alert('暂无可下载资产');
      return;
    }
    await Linking.openURL(url);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <PageHero
        image={HERO_MODEL}
        title="3D 建模"
        subtitle="2D 转 3D + Capture Session + 实时展示"
        overlayColors={[
          'rgba(6, 12, 30, 0.18)',
          'rgba(10, 24, 52, 0.64)',
          'rgba(14, 46, 85, 0.9)',
        ]}
      />

      <View style={styles.modeRow}>
        <Pressable style={[styles.modeBtn, mode === 'job' && styles.modeBtnActive]} onPress={() => setMode('job')}>
          <Icon name="cloud-upload-outline" size={15} color="#EAF6FF" />
          <Text style={styles.modeBtnText}>2D→3D</Text>
        </Pressable>
        <Pressable style={[styles.modeBtn, mode === 'capture' && styles.modeBtnActive]} onPress={() => setMode('capture')}>
          <Icon name="camera-outline" size={15} color="#EAF6FF" />
          <Text style={styles.modeBtnText}>实景捕捉</Text>
        </Pressable>
      </View>

      {mode === 'job' ? (
        <View style={styles.card}>
          <Pressable style={styles.newTaskCard} onPress={() => jobPicker.pickFromGallery()}>
            <View style={styles.newTaskIcon}>
              <Icon name="add-outline" size={18} color="#031225" />
            </View>
            <View style={styles.newTaskCopy}>
              <Text style={styles.newTaskTitle}>创建新任务</Text>
              <Text style={styles.newTaskSub}>上传图片，AI 自动生成 3D 模型</Text>
            </View>
          </Pressable>
          <Text style={styles.sectionTitle}>2D 转 3D 任务</Text>
          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryBtn} onPress={() => jobPicker.pickFromGallery()}>
              <Text style={styles.secondaryBtnText}>选择图片</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={createJob} disabled={loading}>
              <Text style={styles.primaryBtnText}>{loading ? '处理中...' : '创建任务'}</Text>
            </Pressable>
          </View>
          {job ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusLine}>任务ID: {job.taskId}</Text>
              <View style={styles.statusBadgeRow}>
                <Text style={styles.statusLine}>状态</Text>
                <Text style={styles.statusBadge}>{job.status}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {width: `${jobProgressByStatus[job.status] || 0}%`},
                  ]}
                />
              </View>
              <Text style={styles.statusLine}>提示: {job.message || '-'}</Text>
              <View style={styles.actionRow}>
                <Pressable style={styles.secondaryBtn} onPress={loadJobAsset}>
                  <Text style={styles.secondaryBtnText}>加载模型资产</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={() => setViewerVisible(true)} disabled={!viewerUrl}>
                  <Text style={styles.primaryBtnText}>查看模型</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Capture Session</Text>
          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryBtn} onPress={startCaptureSession}>
              <Text style={styles.secondaryBtnText}>创建会话</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={addCaptureFrame} disabled={!session?.id || loading}>
              <Text style={styles.primaryBtnText}>上传一帧</Text>
            </Pressable>
          </View>
          {session ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusLine}>会话ID: {session.id}</Text>
              <Text style={styles.statusLine}>状态: {session.status}</Text>
              <Text style={styles.statusLine}>已采集: {session.acceptedFrameCount}</Text>
              <Text style={styles.statusLine}>建议角度: {session.suggestedAngleTag || '-'}</Text>
              <Text style={styles.statusLine}>{session.statusHint}</Text>
              <Pressable style={styles.primaryBtn} onPress={generateCaptureModel} disabled={loading}>
                <Text style={styles.primaryBtnText}>生成3D模型</Text>
              </Pressable>
              {captureTaskId ? <Text style={styles.statusLine}>生成任务: {captureTaskId}</Text> : null}
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>模型展示</Text>
        <Text style={styles.statusLine}>
          strictMode: {modelingCapability?.strictMode ? 'ON' : 'UNKNOWN'} | provider:{' '}
          {modelingCapability?.provider || '-'}
        </Text>
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryBtn} onPress={() => setViewerVisible(true)} disabled={!viewerUrl}>
            <Text style={styles.secondaryBtnText}>打开内嵌预览</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={openDownload}>
            <Text style={styles.primaryBtnText}>下载资产</Text>
          </Pressable>
        </View>
        {errorText ? <Text style={styles.errorText}>错误: {errorText}</Text> : null}
      </View>

      <Modal visible={viewerVisible} animationType="slide" onRequestClose={() => setViewerVisible(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>模型预览</Text>
            <Pressable style={styles.modalClose} onPress={() => setViewerVisible(false)}>
              <Icon name="close-outline" size={22} color="#EAF6FF" />
            </Pressable>
          </View>
          {viewerUrl ? (
            <WebView source={{html: buildModelViewerHtml(viewerUrl)}} style={styles.webview} />
          ) : (
            <View style={styles.emptyViewer}>
              <Text style={styles.statusLine}>暂无可预览模型</Text>
            </View>
          )}
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {gap: 14, paddingBottom: 24},
  modeRow: {flexDirection: 'row', gap: 10},
  modeBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(145, 204, 255, 0.28)',
    backgroundColor: 'rgba(20, 33, 58, 0.76)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeBtnActive: {
    backgroundColor: 'rgba(77,163,255,0.26)',
    borderColor: 'rgba(111,231,255,0.42)',
  },
  modeBtnText: {
    ...canvasText.bodyStrong,
    color: '#EAF6FF',
  },
  card: {
    ...cardSurfaceBlue,
    ...glassShadow,
    padding: 14,
    gap: 12,
  },
  sectionTitle: {
    ...canvasText.sectionTitle,
    color: '#EAF6FF',
  },
  actionRow: {flexDirection: 'row', gap: 10},
  newTaskCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(145, 204, 255, 0.24)',
    backgroundColor: 'rgba(16, 31, 56, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  newTaskIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#6FE7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newTaskCopy: {
    flex: 1,
    gap: 2,
  },
  newTaskTitle: {
    ...canvasText.bodyStrong,
    color: '#EAF6FF',
  },
  newTaskSub: {
    ...canvasText.caption,
    color: 'rgba(234,246,255,0.72)',
  },
  primaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: '#6FE7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#031225',
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(145, 204, 255, 0.3)',
    backgroundColor: 'rgba(16, 31, 56, 0.74)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#EAF6FF',
  },
  statusCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(145, 204, 255, 0.2)',
    backgroundColor: 'rgba(9, 20, 37, 0.84)',
    padding: 11,
    gap: 7,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    ...canvasText.caption,
    color: '#6FE7FF',
    backgroundColor: 'rgba(111,231,255,0.14)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(145, 204, 255, 0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#6FE7FF',
  },
  statusLine: {
    ...canvasText.body,
    color: 'rgba(234,246,255,0.82)',
    lineHeight: 18,
  },
  errorText: {
    ...canvasText.body,
    color: '#FFB8C8',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#060C1E',
  },
  modalHeader: {
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(133,186,255,0.24)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  modalTitle: {
    ...canvasText.sectionTitle,
    color: '#EAF6FF',
  },
  modalClose: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: 'rgba(77,163,255,0.2)',
  },
  webview: {flex: 1, backgroundColor: '#060C1E'},
  emptyViewer: {flex: 1, alignItems: 'center', justifyContent: 'center'},
});
