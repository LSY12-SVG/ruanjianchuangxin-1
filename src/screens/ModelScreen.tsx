import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {WebView} from 'react-native-webview';
import {useImagePicker} from '../hooks/useImagePicker';
import {useAgentExecutionContextStore} from '../agent/executionContextStore';
import {
  buildCurrentPageSummary,
  resumePendingAgentWorkflow,
  toResultStatusText,
} from '../agent/dualEntryOrchestrator';
import {useAgentWorkflowContinuationStore} from '../agent/workflowContinuationStore';
import {useAgentClientNavigationBridge} from '../agent/clientNavigationBridge';
import {
  ApiRequestError,
  formatApiErrorMessage,
  modelingApi,
  type CaptureSessionResponse,
  type ModelingJobResponse,
  type ModelingModelAssetResponse,
  type ModuleCapabilityItem,
} from '../modules/api';
import {PageHero} from '../components/app/PageHero';
import {HERO_MODEL} from '../assets/design';
import {canvasText, canvasUi, cardSurfaceBlue, glassShadow} from '../theme/canvasDesign';

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
      model-viewer { width: 100%; height: 100%; --progress-bar-color: #A34A3C; }
    </style>
  </head>
  <body>
    <model-viewer
      src="${url}"
      camera-controls
      auto-rotate
      shadow-intensity="1"
      exposure="1"
      loading="eager">
    </model-viewer>
  </body>
</html>`;

const withSlowSubmitHint = (message: string): string => {
  const normalized = String(message || '').toLowerCase();
  const looksLikeSlowSubmit =
    normalized.includes('request aborted') ||
    normalized.includes('timeout') ||
    normalized.includes('network request failed') ||
    normalized.includes('network_error') ||
    normalized.includes('network error');
  if (!looksLikeSlowSubmit) {
    return message;
  }
  return `${message}（任务提交可能较慢，后端仍在处理上传，请稍候后刷新任务状态）`;
};

const bytesToMbText = (bytes?: number): string => {
  if (!bytes || !Number.isFinite(bytes)) {
    return '';
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const formatModelingUploadError = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof ApiRequestError) {
    if (error.code === 'UNSUPPORTED_IMAGE_TYPE') {
      return '图片格式暂不支持，请优先选择 JPG / PNG / WebP。若是 HEIC，请在相册中导出兼容格式后重试。';
    }
    if (error.code === 'FILE_TOO_LARGE') {
      const details = error.details as {maxUploadBytes?: number} | undefined;
      const limitText = bytesToMbText(details?.maxUploadBytes);
      return limitText
        ? `图片过大，当前上传上限约 ${limitText}，请压缩后重试。`
        : '图片过大，请压缩后重试。';
    }
  }
  return withSlowSubmitHint(formatApiErrorMessage(error, fallbackMessage));
};

const resolveJobViewerUrl = (payload?: ModelingJobResponse | null): string => {
  if (!payload) {
    return '';
  }
  return payload.downloadUrl || payload.previewUrl || payload.viewerFiles?.[0]?.url || '';
};

const resolveCaptureViewerUrl = (payload?: ModelingModelAssetResponse | null): string => {
  if (!payload) {
    return '';
  }
  return payload.glbUrl || payload.viewerFiles?.[0]?.url || '';
};

interface ModelScreenProps {
  capabilities: ModuleCapabilityItem[];
}

export const ModelScreen: React.FC<ModelScreenProps> = ({capabilities}) => {
  const {width: windowWidth} = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('job');
  const [job, setJob] = useState<ModelingJobResponse | null>(null);
  const [jobAssetUrl, setJobAssetUrl] = useState('');
  const [session, setSession] = useState<CaptureSessionResponse | null>(null);
  const [captureTaskId, setCaptureTaskId] = useState('');
  const [captureModel, setCaptureModel] = useState<ModelingModelAssetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [agentHintText, setAgentHintText] = useState('');
  const resumeCycleKeyRef = useRef('');
  const syncedModelingImageKeyRef = useRef('');
  const setModelingImageContext = useAgentExecutionContextStore(
    state => state.setModelingImageContext,
  );
  const modelingImageContext = useAgentExecutionContextStore(state => state.modelingImageContext);
  const colorContext = useAgentExecutionContextStore(state => state.colorContext);
  const pendingWorkflow = useAgentWorkflowContinuationStore(state => state.pendingWorkflow);
  const navigateToTab = useAgentClientNavigationBridge(state => state.navigateToTab);

  const modelingGalleryOptions = useMemo(
    () => ({
      assetRepresentationMode: 'compatible' as const,
      conversionQuality: 0.92,
    }),
    [],
  );

  const jobPicker = useImagePicker({
    onImageError: message => setErrorText(message),
    galleryOptions: modelingGalleryOptions,
    requireNativeDecodeForHeif: false,
  });
  const capturePicker = useImagePicker({
    onImageError: message => setErrorText(message),
    galleryOptions: modelingGalleryOptions,
    requireNativeDecodeForHeif: false,
  });

  const modelingCapability = capabilities.find(item => item.module === 'modeling');
  const pendingModelGuide = useMemo(
    () => pendingWorkflow?.missingContextGuides.find(item => item.targetTab === 'model') || null,
    [pendingWorkflow],
  );

  useEffect(() => {
    const selected = jobPicker.selectedImage;
    const normalizedBase64 = String(selected?.base64 || '')
      .replace(/^data:[^;]+;base64,/, '')
      .trim();
    if (!selected?.success || !normalizedBase64) {
      syncedModelingImageKeyRef.current = '';
      return;
    }
    const nextImageKey = [
      normalizedBase64,
      selected.type || 'image/jpeg',
      selected.fileName || 'agent-model.jpg',
      selected.width || 0,
      selected.height || 0,
    ].join(':');
    if (syncedModelingImageKeyRef.current === nextImageKey) {
      return;
    }
    syncedModelingImageKeyRef.current = nextImageKey;
    setModelingImageContext({
      image: {
        mimeType: selected.type || 'image/jpeg',
        fileName: selected.fileName || 'agent-model.jpg',
        base64: normalizedBase64,
        width: selected.width,
        height: selected.height,
      },
    });
  }, [jobPicker.selectedImage, setModelingImageContext]);

  useEffect(() => {
    const isWaitingContext = pendingWorkflow?.workflowRun?.status === 'waiting_context';
    if (!modelingImageContext?.image?.base64 || !pendingWorkflow || !isWaitingContext) {
      return;
    }
    const resumeKey = [
      pendingWorkflow.plan.planId,
      pendingWorkflow.latestExecuteResult?.executionId || 'root',
      pendingModelGuide?.operation || 'model-context',
      modelingImageContext.image.base64 ? `${modelingImageContext.image.base64.length}` : 'missing',
    ].join(':');
    if (resumeCycleKeyRef.current === resumeKey) {
      return;
    }
    resumeCycleKeyRef.current = resumeKey;

    let cancelled = false;
    const resume = async () => {
      try {
        setErrorText('');
        setAgentHintText('已检测到补图，正在自动继续 Agent 工作流...');
        const cycle = await resumePendingAgentWorkflow({
          context: {
            currentTab: 'model',
            colorContext,
            modelingImageContext,
            latestExecuteResult: pendingWorkflow.latestExecuteResult,
          },
          clientHandlers: {
            navigateToTab,
            summarizeCurrentPage: () =>
              buildCurrentPageSummary({
                currentTab: 'model',
                colorContext,
                modelingImageContext,
                latestPlan: pendingWorkflow.plan,
                latestExecuteResult: pendingWorkflow.latestExecuteResult,
              }),
          },
        });
        if (!cancelled && cycle?.executeResult) {
          if (cycle.executeResult.status === 'failed') {
            const failedMessage =
              cycle.executeResult.actionResults.find(item => item.status === 'failed')?.message ||
              '续跑失败';
            setAgentHintText('');
            setErrorText(failedMessage);
            return;
          }
          setAgentHintText(`已自动继续 Agent 工作流：${toResultStatusText(cycle.executeResult.status)}`);
        }
      } catch (error) {
        if (!cancelled) {
          setAgentHintText('');
          setErrorText(formatApiErrorMessage(error, '自动续跑失败'));
        }
      }
    };
    resume().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [colorContext, modelingImageContext, navigateToTab, pendingModelGuide?.operation, pendingWorkflow]);

  useEffect(() => {
    if (job?.status === 'succeeded') {
      const nextViewerUrl = resolveJobViewerUrl(job);
      if (nextViewerUrl) {
        setJobAssetUrl(nextViewerUrl);
      }
    }
  }, [job]);

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
            const nextViewerUrl = resolveJobViewerUrl(next);
            if (nextViewerUrl) {
              setJobAssetUrl(nextViewerUrl);
            }
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

  const effectiveJobImage = useMemo(() => {
    if (jobPicker.selectedImage?.success) {
      return jobPicker.selectedImage;
    }
    const storedImage = modelingImageContext?.image;
    const storedBase64 = String(storedImage?.base64 || '').replace(/^data:[^;]+;base64,/, '').trim();
    if (!storedImage || !storedBase64) {
      return null;
    }
    const mimeType = String(storedImage.mimeType || 'image/jpeg');
    return {
      success: true,
      uri: `data:${mimeType};base64,${storedBase64}`,
      base64: storedBase64,
      type: mimeType,
      fileName: storedImage.fileName || 'agent-model.jpg',
    };
  }, [jobPicker.selectedImage, modelingImageContext]);

  const uploadPreviewUri = effectiveJobImage?.success ? effectiveJobImage.uri || '' : '';
  const uploadPreviewHeight = useMemo(() => {
    const sourceWidth = Number(effectiveJobImage?.width || 0);
    const sourceHeight = Number(effectiveJobImage?.height || 0);
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return 220;
    }
    const ratio = sourceWidth / sourceHeight;
    // The preview card has horizontal paddings and borders; reserve room to avoid overflow.
    const usableWidth = Math.max(windowWidth - 72, 220);
    const fittedHeight = usableWidth / ratio;
    return Math.max(170, Math.min(360, fittedHeight));
  }, [effectiveJobImage?.height, effectiveJobImage?.width, windowWidth]);
  const captureViewerUrl = resolveCaptureViewerUrl(captureModel);
  const viewerUrl = useMemo(() => {
    if (mode === 'capture') {
      return captureViewerUrl || jobAssetUrl;
    }
    return jobAssetUrl || captureViewerUrl;
  }, [captureViewerUrl, jobAssetUrl, mode]);

  const modelEmptyText = useMemo(() => {
    const jobRunning = job?.status === 'queued' || job?.status === 'processing';
    if (jobRunning || (captureTaskId && !captureModel)) {
      return '模型生成中，请稍候...';
    }
    if (job?.status === 'succeeded' || captureTaskId) {
      return '暂无可预览模型，后端正在准备预览资产。';
    }
    return '暂无可预览模型';
  }, [captureModel, captureTaskId, job]);

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
      setJobAssetUrl(resolveJobViewerUrl(created));
    } catch (error) {
      const message = formatModelingUploadError(error, '创建任务失败');
      setErrorText(message);
      Alert.alert('创建任务失败', message);
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
      const message = formatModelingUploadError(error, '上传帧失败');
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
      const message = withSlowSubmitHint(formatApiErrorMessage(error, '生成失败'));
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
        variant="contrast"
        overlayStrength="strong"
      />

      <View style={styles.modeRow}>
        <Pressable style={[styles.modeBtn, mode === 'job' && styles.modeBtnActive]} onPress={() => setMode('job')}>
          <Icon name="cloud-upload" size={15} color="#3B2F29" />
          <Text style={styles.modeBtnText}>2D→3D</Text>
        </Pressable>
        <Pressable style={[styles.modeBtn, mode === 'capture' && styles.modeBtnActive]} onPress={() => setMode('capture')}>
          <Icon name="camera" size={15} color="#3B2F29" />
          <Text style={styles.modeBtnText}>实景捕捉</Text>
        </Pressable>
      </View>
      {pendingModelGuide ? (
        <View style={styles.agentGuideBar}>
          <View style={styles.agentGuideHead}>
            <Icon name="flash" size={14} color="#A34A3C" />
            <Text style={styles.agentGuideTitle}>Agent 等待补图</Text>
          </View>
          <Text style={styles.agentGuideText}>{pendingModelGuide.message}</Text>
        </View>
      ) : null}

      {mode === 'job' ? (
        <View style={styles.card}>
          <Pressable style={styles.newTaskCard} onPress={() => jobPicker.pickFromGallery()}>
            <View style={styles.newTaskIcon}>
              <Icon name="add" size={18} color="#FFF6F2" />
            </View>
            <View style={styles.newTaskCopy}>
              <Text style={styles.newTaskTitle}>
                {pendingModelGuide ? '上传图片继续工作流' : '创建新任务'}
              </Text>
              <Text style={styles.newTaskSub}>
                {pendingModelGuide ? pendingModelGuide.message : '上传图片，AI 自动生成 3D 模型'}
              </Text>
            </View>
          </Pressable>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="cube" size={13} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>2D 转 3D 任务</Text>
          </View>
          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryBtn} onPress={() => jobPicker.pickFromGallery()}>
              <Icon name="image" size={15} color="#3B2F29" />
              <Text style={styles.secondaryBtnText}>
                {pendingModelGuide ? '选图并继续' : '选图'}
              </Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={createJob} disabled={loading}>
              <Icon name="send" size={15} color="#FFF6F2" />
              <Text style={styles.primaryBtnText}>{loading ? '处理中...' : '创建任务'}</Text>
            </Pressable>
          </View>
          {uploadPreviewUri ? (
            <View style={styles.uploadPreviewCard} testID="job-upload-preview">
              <Text style={styles.previewLabel}>上传图片预览</Text>
              <Image
                testID="job-upload-preview-image"
                source={{uri: uploadPreviewUri}}
                style={[styles.uploadPreviewImage, {height: uploadPreviewHeight}]}
                resizeMode="contain"
              />
              <Text style={styles.previewMeta}>{effectiveJobImage?.fileName || uploadPreviewUri}</Text>
            </View>
          ) : null}
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
              {job.status === 'succeeded' && !jobAssetUrl ? (
                <Text style={styles.statusLine}>模型已生成，正在准备预览资源...</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIconBadge}>
              <Icon name="aperture" size={13} color="#A34A3C" />
            </View>
            <Text style={styles.sectionTitle}>Capture Session</Text>
          </View>
          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryBtn} onPress={startCaptureSession}>
              <Icon name="albums" size={15} color="#3B2F29" />
              <Text style={styles.secondaryBtnText}>创建会话</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={addCaptureFrame} disabled={!session?.id || loading}>
              <Icon name="cloud-upload" size={15} color="#FFF6F2" />
              <Text style={styles.primaryBtnText}>上传一帧</Text>
            </Pressable>
          </View>
          {session ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusLine}>会话ID: {session.id}</Text>
              <Text style={styles.statusLine}>状态: {session.status}</Text>
              <Text style={styles.statusLine}>已采集: {session.acceptedFrameCount}</Text>
              <Pressable style={styles.primaryBtn} onPress={generateCaptureModel} disabled={loading}>
                <Icon name="sparkles" size={15} color="#FFF6F2" />
                <Text style={styles.primaryBtnText}>生成3D模型</Text>
              </Pressable>
              {captureTaskId ? <Text style={styles.statusLine}>生成任务: {captureTaskId}</Text> : null}
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="eye" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>模型展示</Text>
        </View>
        <Text style={styles.statusLine}>
          strictMode: {modelingCapability?.strictMode ? 'ON' : 'UNKNOWN'} | provider:{' '}
          {modelingCapability?.provider || '-'}
        </Text>
        <Text style={styles.statusLine}>当前上传图: {uploadPreviewUri || '-'}</Text>
        <Text style={styles.statusLine}>当前模型URL: {viewerUrl || '-'}</Text>
        <Pressable style={styles.primaryBtn} onPress={openDownload}>
          <Icon name="download" size={15} color="#FFF6F2" />
          <Text style={styles.primaryBtnText}>下载资产</Text>
        </Pressable>
        <View style={styles.inlineViewerFrame}>
          {viewerUrl ? (
            <WebView
              testID="inline-model-viewer"
              source={{html: buildModelViewerHtml(viewerUrl)}}
              originWhitelist={['*']}
              onShouldStartLoadWithRequest={request => {
                // Block Scene Viewer intent in WebView; keep in-page preview only.
                if (request.url?.startsWith('intent://')) {
                  return false;
                }
                return true;
              }}
              style={styles.webview}
            />
          ) : (
            <View style={styles.inlineViewerEmpty}>
              <Text style={styles.statusLine}>{modelEmptyText}</Text>
            </View>
          )}
        </View>
        {agentHintText ? <Text style={styles.statusLine}>{agentHintText}</Text> : null}
        {errorText ? <Text style={styles.errorText}>错误: {errorText}</Text> : null}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {gap: 14, paddingBottom: 24},
  modeRow: {flexDirection: 'row', gap: 10},
  modeBtn: {
    ...canvasUi.chip,
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeBtnActive: {
    ...canvasUi.chipActive,
  },
  modeBtnText: {
    ...canvasText.bodyStrong,
    color: '#3B2F29',
  },
  card: {
    ...cardSurfaceBlue,
    ...glassShadow,
    padding: 14,
    gap: 12,
  },
  agentGuideBar: {
    ...cardSurfaceBlue,
    ...glassShadow,
    padding: 12,
    gap: 10,
  },
  agentGuideHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  agentGuideTitle: {
    ...canvasText.bodyStrong,
    color: '#3B2F29',
  },
  agentGuideText: {
    ...canvasText.body,
    color: 'rgba(109,90,80,0.86)',
    lineHeight: 18,
  },
  sectionTitle: {
    ...canvasText.sectionTitle,
    color: '#3B2F29',
  },
  sectionHead: {
    ...canvasUi.titleWithIcon,
  },
  sectionIconBadge: {
    ...canvasUi.iconBadge,
  },
  actionRow: {flexDirection: 'row', gap: 10},
  newTaskCard: {
    ...canvasUi.subtleCard,
    borderRadius: 14,
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
    backgroundColor: '#A34A3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newTaskCopy: {
    flex: 1,
    gap: 2,
  },
  newTaskTitle: {
    ...canvasText.bodyStrong,
    color: '#3B2F29',
  },
  newTaskSub: {
    ...canvasText.caption,
    color: 'rgba(109,90,80,0.84)',
  },
  primaryBtn: {
    ...canvasUi.primaryButton,
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#FFF6F2',
  },
  secondaryBtn: {
    ...canvasUi.secondaryButton,
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 6,
  },
  secondaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#3B2F29',
  },
  statusCard: {
    ...canvasUi.subtleCard,
    borderRadius: 14,
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
    color: '#A34A3C',
    backgroundColor: 'rgba(163,74,60,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  progressTrack: {
    ...canvasUi.progressTrack,
  },
  progressFill: {
    ...canvasUi.progressFill,
  },
  statusLine: {
    ...canvasText.body,
    color: 'rgba(76,64,56,0.9)',
    lineHeight: 18,
  },
  uploadPreviewCard: {
    ...canvasUi.subtleCard,
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  previewLabel: {
    ...canvasText.caption,
    color: 'rgba(76,64,56,0.9)',
  },
  uploadPreviewImage: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    backgroundColor: 'rgba(241,229,220,0.95)',
  },
  previewMeta: {
    ...canvasText.caption,
    color: 'rgba(109,90,80,0.8)',
  },
  errorText: {
    ...canvasText.body,
    color: '#C35B63',
  },
  inlineViewerFrame: {
    minHeight: 320,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(171,129,110,0.3)',
    backgroundColor: '#F3E7DF',
  },
  webview: {flex: 1, minHeight: 320, backgroundColor: '#F3E7DF'},
  inlineViewerEmpty: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});

