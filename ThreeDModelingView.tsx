import React from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';

import type {CaptureFrame, CaptureSession, ModelAsset, ReconstructionTask} from './ImageTo3DService';
import {
  ANGLE_LABELS,
  ISSUE_LABELS,
  getAngleLabel,
  getTaskStatusMessage,
  shouldAllowWebViewRequest,
  type FlowStage,
  type PermissionState,
} from './ThreeDModeling.shared';

type Props = {
  bootstrapping: boolean;
  currentAngleTag: string;
  currentStage: FlowStage;
  captureSession: CaptureSession | null;
  task: ReconstructionTask | null;
  modelAsset: ModelAsset | null;
  localFrameUris: Record<string, string>;
  permissionState: PermissionState;
  statusMessage: string;
  errorMessage: string | null;
  reviewMessage: string | null;
  viewerErrorMessage: string | null;
  captureBusy: boolean;
  canGenerate: boolean;
  generateBusy: boolean;
  previewHtml: string | null;
  onBack: () => void;
  onAngleSelect: (angleTag: string) => void;
  onCapture: () => void;
  onGenerate: () => void;
  onPreviewError: (payload: unknown) => void;
  onPreviewMessage: (rawEventData: string) => void;
  onStartOver: () => void;
};

const STAGES: Array<{id: FlowStage; label: string; caption: string}> = [
  {id: 'restore', label: '恢复会话', caption: '接续未完成拍摄'},
  {id: 'capture', label: '采集素材', caption: '多角度拍摄原型'},
  {id: 'generate', label: '生成模型', caption: '等待云端重建'},
  {id: 'preview', label: '预览演示', caption: '查看 360° 模型'},
];

const STAGE_ORDER: Record<FlowStage, number> = {
  restore: 0,
  capture: 1,
  generate: 2,
  preview: 3,
};

function MessageCard({
  tone,
  children,
}: {
  tone: 'neutral' | 'success' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.messageCard,
        tone === 'success' && styles.messageCardSuccess,
        tone === 'danger' && styles.messageCardDanger,
      ]}>
      <Text
        style={[
          styles.messageText,
          tone === 'success' && styles.messageTextSuccess,
          tone === 'danger' && styles.messageTextDanger,
        ]}>
        {children}
      </Text>
    </View>
  );
}

function FrameItem({
  frame,
  index,
  localFrameUris,
}: {
  frame: CaptureFrame;
  index: number;
  localFrameUris: Record<string, string>;
}) {
  const imageSource = localFrameUris[frame.id]
    ? {uri: localFrameUris[frame.id]}
    : frame.imageUrl
      ? {uri: frame.imageUrl}
      : null;

  return (
    <View key={frame.id} style={styles.frameCard}>
      <View style={[styles.frameThumbnail, !imageSource && styles.frameThumbnailPlaceholder]}>
        {imageSource ? <Image source={imageSource} style={styles.frameThumbnailImage} /> : null}
      </View>
      <View style={styles.frameMeta}>
        <Text style={styles.frameTitle}>{`${index + 1}. ${getAngleLabel(frame.angleTag)}`}</Text>
        <Text style={styles.frameSubtitle}>
          {frame.accepted ? '已通过' : '建议重拍'} · {Math.round(frame.qualityScore * 100)} 分
        </Text>
        {frame.qualityIssues.length > 0 ? (
          <Text style={styles.frameIssues}>
            {frame.qualityIssues.map(issue => ISSUE_LABELS[issue] || issue).join('、')}
          </Text>
        ) : (
          <Text style={styles.frameIssues}>构图清晰，可继续补拍其它角度。</Text>
        )}
      </View>
    </View>
  );
}

export default function ThreeDModelingView({
  bootstrapping,
  currentAngleTag,
  currentStage,
  captureSession,
  task,
  modelAsset,
  localFrameUris,
  permissionState,
  statusMessage,
  errorMessage,
  reviewMessage,
  viewerErrorMessage,
  captureBusy,
  canGenerate,
  generateBusy,
  previewHtml,
  onBack,
  onAngleSelect,
  onCapture,
  onGenerate,
  onPreviewError,
  onPreviewMessage,
  onStartOver,
}: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroShell}>
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />
          <View style={styles.headerRow}>
            <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.backButton}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerEyebrow}>Vision Genie Lab</Text>
              <Text style={styles.headerTitle}>AGI 相机 3D 建模</Text>
              <Text style={styles.headerSubtitle}>
                先采集多角度手工艺品素材，再生成可交互的 360° 展示模型。
              </Text>
            </View>
          </View>

          <View style={styles.stageRail}>
            {STAGES.map(stage => {
              const order = STAGE_ORDER[stage.id];
              const currentOrder = STAGE_ORDER[currentStage];
              const isActive = stage.id === currentStage;
              const isComplete = order < currentOrder;

              return (
                <View
                  key={stage.id}
                  style={[
                    styles.stageChip,
                    isActive && styles.stageChipActive,
                    isComplete && styles.stageChipComplete,
                  ]}>
                  <Text
                    style={[
                      styles.stageLabel,
                      isActive && styles.stageLabelActive,
                      isComplete && styles.stageLabelComplete,
                    ]}>
                    {stage.label}
                  </Text>
                  <Text
                    style={[
                      styles.stageCaption,
                      isActive && styles.stageCaptionActive,
                      isComplete && styles.stageCaptionComplete,
                    ]}>
                    {stage.caption}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {bootstrapping ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#FFD38A" />
            <View style={styles.loadingTextWrap}>
              <Text style={styles.loadingTitle}>正在恢复拍摄会话...</Text>
              <Text style={styles.loadingBody}>我们会优先找回未完成的采集和建模进度。</Text>
            </View>
          </View>
        ) : null}

        {captureSession ? (
          <View style={styles.captureDeck} testID="capture-guide-card">
            <View style={styles.captureHeroCard}>
              <View style={styles.captureHeroHeader}>
                <View style={styles.captureTitleWrap}>
                  <Text style={styles.captureEyebrow}>当前拍摄角度</Text>
                  <Text style={styles.captureAngle}>{getAngleLabel(currentAngleTag)}</Text>
                  <Text style={styles.captureCaption}>{captureSession.statusHint}</Text>
                </View>

                <View style={styles.progressOrb}>
                  <Text style={styles.progressValue}>{captureSession.acceptedFrameCount}</Text>
                  <Text style={styles.progressLabel}>/ {captureSession.targetFrameCount}</Text>
                </View>
              </View>

              <View style={styles.cameraStage}>
                <View style={styles.cameraOrbit} />
                <View style={styles.cameraFrame}>
                  <View style={styles.cameraGuideOuter} />
                  <View style={styles.cameraGuideInner} />
                  <Text style={styles.cameraHint}>将手工艺品放入取景框中央，保持背景尽量干净</Text>
                </View>
              </View>

              <Text style={styles.captureSummary}>点击下方任意角度可自由切换拍摄顺序。</Text>

              <View style={styles.angleRow}>
                {Object.keys(ANGLE_LABELS).map(angleTag => {
                  const captured = captureSession.frames.some(
                    frame => frame.accepted && frame.angleTag === angleTag,
                  );
                  const active = currentAngleTag === angleTag;

                  return (
                    <TouchableOpacity
                      key={angleTag}
                      accessibilityRole="button"
                      onPress={() => onAngleSelect(angleTag)}
                      style={[
                        styles.angleBadge,
                        captured && styles.angleBadgeComplete,
                        active && styles.angleBadgeActive,
                      ]}>
                      <Text
                        style={[
                          styles.angleBadgeText,
                          captured && styles.angleBadgeTextComplete,
                          active && styles.angleBadgeTextActive,
                        ]}>
                        {getAngleLabel(angleTag)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.92}
                onPress={onCapture}
                disabled={captureBusy || bootstrapping}
                style={[styles.captureButton, captureBusy && styles.buttonDisabled]}
                testID="capture-button">
                <Text style={styles.captureButtonText}>
                  {captureBusy ? '上传当前视角...' : `拍摄 ${getAngleLabel(currentAngleTag)}`}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoGrid}>
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>通过素材</Text>
                <Text style={styles.infoValue}>
                  {captureSession.acceptedFrameCount} / {captureSession.targetFrameCount}
                </Text>
                <Text style={styles.infoHint}>
                  至少需要 {captureSession.minimumFrameCount} 张才能开始生成。
                </Text>
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>推荐下一角度</Text>
                <Text style={styles.infoValue}>
                  {getAngleLabel(captureSession.suggestedAngleTag || currentAngleTag)}
                </Text>
                <Text style={styles.infoHint}>
                  剩余 {captureSession.remainingCount} 个建议补拍视角。
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {statusMessage ? <MessageCard tone="neutral">{statusMessage}</MessageCard> : null}
        {task ? <MessageCard tone="neutral">{getTaskStatusMessage(task)}</MessageCard> : null}
        {reviewMessage ? <MessageCard tone="success">{reviewMessage}</MessageCard> : null}
        {errorMessage ? <MessageCard tone="danger">{errorMessage}</MessageCard> : null}

        {captureSession ? (
          <View style={styles.generateCard}>
            <View style={styles.generateHeader}>
              <View>
                <Text style={styles.sectionTitle}>生成控制台</Text>
                <Text style={styles.sectionSubtitle}>
                  素材采集达到阈值后，即可提交云端进行 3D 重建。
                </Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>
                  {modelAsset ? '可预览' : currentStage === 'generate' ? '生成中' : '待生成'}
                </Text>
              </View>
            </View>

            {permissionState !== 'granted' && permissionState !== 'unknown' ? (
              <Text style={styles.sectionSubtitle}>当前未授权相机权限，请先允许访问后再继续。</Text>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{disabled: !canGenerate}}
              disabled={!canGenerate}
              onPress={onGenerate}
              style={[styles.generateButton, !canGenerate && styles.buttonDisabled]}
              testID="generate-button">
              <Text style={styles.generateButtonText}>
                {generateBusy ||
                (task &&
                  task.status !== 'succeeded' &&
                  task.status !== 'failed' &&
                  task.status !== 'expired')
                  ? '正在生成 3D 模型...'
                  : '开始生成 3D 演示'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {captureSession?.frames?.length ? (
          <View style={styles.frameListCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>已采集视角</Text>
              <Text style={styles.sectionSubtitle}>按通过状态和质量提示查看每张素材。</Text>
            </View>
            {captureSession.frames.map((frame, index) => (
              <FrameItem
                key={frame.id}
                frame={frame}
                index={index}
                localFrameUris={localFrameUris}
              />
            ))}
          </View>
        ) : null}

        {modelAsset ? (
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View>
                <Text style={styles.sectionTitle}>360° 3D 演示</Text>
                <Text style={styles.sectionSubtitle}>拖拽、缩放并检查生成后的最终效果。</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={onStartOver}
                style={styles.restartButton}
                testID="restart-button">
                <Text style={styles.restartButtonText}>重新拍摄</Text>
              </TouchableOpacity>
            </View>

            {viewerErrorMessage ? <MessageCard tone="danger">{viewerErrorMessage}</MessageCard> : null}

            {previewHtml ? (
              <View style={styles.webViewWrapper} testID="model-preview">
                <WebView
                  testID="model-preview-webview"
                  originWhitelist={['http://*', 'https://*', 'about:blank', 'data:*', 'blob:*']}
                  source={{
                    html: previewHtml,
                    baseUrl: 'https://appassets.androidplatform.net/',
                  }}
                  javaScriptEnabled
                  domStorageEnabled
                  mixedContentMode="always"
                  setSupportMultipleWindows={false}
                  scrollEnabled={false}
                  allowsInlineMediaPlayback
                  onShouldStartLoadWithRequest={request => shouldAllowWebViewRequest(request.url)}
                  onMessage={syntheticEvent => {
                    onPreviewMessage(syntheticEvent.nativeEvent.data);
                  }}
                  onError={syntheticEvent => {
                    onPreviewError(syntheticEvent.nativeEvent);
                  }}
                />
              </View>
            ) : null}

            {modelAsset.thumbnailUrl && viewerErrorMessage ? (
              <Image source={{uri: modelAsset.thumbnailUrl}} style={styles.previewImage} />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08131C',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 32,
  },
  heroShell: {
    marginTop: 8,
    marginBottom: 18,
    padding: 22,
    borderRadius: 30,
    backgroundColor: '#0D1D29',
    overflow: 'hidden',
  },
  heroGlowOne: {
    position: 'absolute',
    top: -30,
    right: -10,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 176, 94, 0.18)',
  },
  heroGlowTwo: {
    position: 'absolute',
    bottom: -60,
    left: -40,
    width: 200,
    height: 200,
    borderRadius: 999,
    backgroundColor: 'rgba(58, 188, 255, 0.16)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  backButton: {
    marginRight: 12,
    paddingVertical: 6,
    paddingRight: 10,
  },
  backText: {
    color: '#FFF6EA',
    fontSize: 34,
    lineHeight: 36,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerEyebrow: {
    color: '#FFD38A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  headerTitle: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  headerSubtitle: {
    marginTop: 8,
    color: '#B6CAD8',
    fontSize: 14,
    lineHeight: 21,
  },
  stageRail: {
    marginTop: 20,
    gap: 10,
  },
  stageChip: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  stageChipActive: {
    backgroundColor: 'rgba(255,211,138,0.14)',
    borderColor: 'rgba(255,211,138,0.42)',
  },
  stageChipComplete: {
    backgroundColor: 'rgba(104, 238, 187, 0.12)',
    borderColor: 'rgba(104, 238, 187, 0.32)',
  },
  stageLabel: {
    color: '#9CB3C3',
    fontSize: 14,
    fontWeight: '700',
  },
  stageLabelActive: {
    color: '#FFF4E2',
  },
  stageLabelComplete: {
    color: '#D8FFF0',
  },
  stageCaption: {
    marginTop: 4,
    color: '#6F8798',
    fontSize: 12,
  },
  stageCaptionActive: {
    color: '#EFD8B2',
  },
  stageCaptionComplete: {
    color: '#9FD5BC',
  },
  loadingCard: {
    marginBottom: 18,
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#10212D',
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingTextWrap: {
    marginLeft: 12,
    flex: 1,
  },
  loadingTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingBody: {
    marginTop: 4,
    color: '#96B0C0',
    fontSize: 13,
    lineHeight: 19,
  },
  captureDeck: {
    marginBottom: 18,
  },
  captureHeroCard: {
    padding: 20,
    borderRadius: 28,
    backgroundColor: '#102331',
    marginBottom: 14,
  },
  captureHeroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  captureTitleWrap: {
    flex: 1,
    paddingRight: 16,
  },
  captureEyebrow: {
    color: '#8FD6FF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  captureAngle: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  captureCaption: {
    marginTop: 8,
    color: '#A9C0CF',
    fontSize: 14,
    lineHeight: 20,
  },
  progressOrb: {
    minWidth: 86,
    minHeight: 86,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#FFD38A',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,211,138,0.12)',
  },
  progressValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  progressLabel: {
    color: '#DCC29A',
    fontSize: 12,
  },
  cameraStage: {
    marginTop: 18,
    height: 300,
    borderRadius: 26,
    backgroundColor: '#09151E',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cameraOrbit: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cameraFrame: {
    width: '74%',
    height: '74%',
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cameraGuideOuter: {
    position: 'absolute',
    width: '74%',
    height: '74%',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,211,138,0.42)',
  },
  cameraGuideInner: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#FFD38A',
  },
  cameraHint: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    textAlign: 'center',
    color: '#CFE0EA',
    fontSize: 13,
    lineHeight: 18,
  },
  captureSummary: {
    marginTop: 16,
    color: '#C6D7E2',
    fontSize: 14,
    lineHeight: 20,
  },
  angleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  angleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#163142',
  },
  angleBadgeComplete: {
    backgroundColor: '#1C664E',
  },
  angleBadgeActive: {
    backgroundColor: '#8A5B10',
  },
  angleBadgeText: {
    color: '#A8C0D1',
    fontSize: 12,
  },
  angleBadgeTextComplete: {
    color: '#DBFFF0',
  },
  angleBadgeTextActive: {
    color: '#FFF7EA',
    fontWeight: '700',
  },
  captureButton: {
    marginTop: 18,
    minHeight: 58,
    borderRadius: 999,
    backgroundColor: '#FFD38A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonText: {
    color: '#08131C',
    fontSize: 17,
    fontWeight: '800',
  },
  infoGrid: {
    gap: 12,
  },
  infoCard: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#0F1D28',
  },
  infoLabel: {
    color: '#7FA1B6',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  infoValue: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  infoHint: {
    marginTop: 6,
    color: '#A7C0D0',
    fontSize: 13,
    lineHeight: 19,
  },
  messageCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#11212D',
  },
  messageCardSuccess: {
    backgroundColor: '#16281C',
  },
  messageCardDanger: {
    backgroundColor: '#34181B',
  },
  messageText: {
    color: '#D6E4EE',
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextSuccess: {
    color: '#DDF5E3',
  },
  messageTextDanger: {
    color: '#FFC7CB',
  },
  generateCard: {
    marginBottom: 18,
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#0E1A26',
  },
  generateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
  },
  sectionSubtitle: {
    marginTop: 6,
    color: '#9FB6C5',
    fontSize: 13,
    lineHeight: 19,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#163142',
  },
  statusPillText: {
    color: '#D7EFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  generateButton: {
    marginTop: 18,
    minHeight: 60,
    borderRadius: 999,
    backgroundColor: '#2E8FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  frameListCard: {
    marginBottom: 18,
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#0E1A26',
  },
  frameCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 20,
    backgroundColor: '#11212D',
    flexDirection: 'row',
    alignItems: 'center',
  },
  frameThumbnail: {
    width: 78,
    height: 78,
    borderRadius: 18,
    backgroundColor: '#173344',
    overflow: 'hidden',
  },
  frameThumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameThumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  frameMeta: {
    marginLeft: 12,
    flex: 1,
  },
  frameTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  frameSubtitle: {
    marginTop: 4,
    color: '#A3C1D2',
    fontSize: 13,
  },
  frameIssues: {
    marginTop: 4,
    color: '#7FA3B6',
    fontSize: 12,
    lineHeight: 17,
  },
  previewCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#0E1A26',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  restartButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#173043',
  },
  restartButtonText: {
    color: '#D8EEF8',
    fontSize: 13,
    fontWeight: '700',
  },
  webViewWrapper: {
    height: 380,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#071019',
  },
  previewImage: {
    marginTop: 12,
    width: '100%',
    height: 360,
    borderRadius: 18,
    resizeMode: 'cover',
    backgroundColor: '#071019',
  },
});
