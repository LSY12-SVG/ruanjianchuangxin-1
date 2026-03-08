import React, {useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {VISION_THEME} from '../theme/visionTheme';
import {useAgentRuntime} from '../agent/runtimeContext';

const QUICK_PROMPTS = [
  '帮我规划夜景拍摄参数',
  '生成一套人像电影感调色步骤',
  '把今天素材整理成可发布短视频脚本',
  '根据天气给我最佳构图建议',
];

const AGENT_CAPS = [
  {label: '拍摄建议', icon: 'camera-outline'},
  {label: '调色指导', icon: 'color-filter-outline'},
  {label: '3D流程编排', icon: 'cube-outline'},
  {label: '内容发布助手', icon: 'megaphone-outline'},
];

export const AIAgentScreen: React.FC = () => {
  const [activePrompt, setActivePrompt] = useState(0);
  const {phase, pendingActions, memory, lastMessage, lastError, openPanel} = useAgentRuntime();

  return (
    <LinearGradient
      colors={[
        VISION_THEME.background.top,
        VISION_THEME.background.mid,
        VISION_THEME.background.bottom,
      ]}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View>
            <Text style={styles.heroTitle}>Vision Agent</Text>
            <Text style={styles.heroSubtitle}>贯穿拍摄、调色、建模与发布的智能中枢</Text>
          </View>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>在线</Text>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>核心能力</Text>
          <View style={styles.capGrid}>
            {AGENT_CAPS.map(item => (
              <View key={item.label} style={styles.capCard}>
                <Icon name={item.icon} size={20} color={VISION_THEME.accent.main} />
                <Text style={styles.capText}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>智能会话</Text>
          <View style={styles.chatCard}>
            <View style={styles.bubbleAgent}>
              <Text style={styles.bubbleLabel}>Agent</Text>
              <Text style={styles.bubbleText}>
                我已分析你最近 12 组样片。建议优先处理曝光回收与肤色一致性，我可以直接生成批处理方案。
              </Text>
            </View>
            <View style={styles.bubbleUser}>
              <Text style={styles.bubbleLabel}>你</Text>
              <Text style={styles.bubbleText}>{QUICK_PROMPTS[activePrompt]}</Text>
            </View>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>运行时状态</Text>
          <View style={styles.statusPanel}>
            <Text style={styles.statusLine}>阶段: {phase}</Text>
            <Text style={styles.statusLine}>待确认动作: {pendingActions.length}</Text>
            <Text style={styles.statusLine}>历史任务: {memory.history.length}</Text>
            {lastMessage ? <Text style={styles.statusLine}>{lastMessage}</Text> : null}
            {lastError ? <Text style={styles.statusError}>{lastError}</Text> : null}
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>快捷任务</Text>
          <View style={styles.promptList}>
            {QUICK_PROMPTS.map((prompt, idx) => {
              const active = idx === activePrompt;
              return (
                <TouchableOpacity
                  key={prompt}
                  style={[styles.promptItem, active && styles.promptItemActive]}
                  onPress={() => setActivePrompt(idx)}
                  activeOpacity={0.86}>
                  <Text style={[styles.promptText, active && styles.promptTextActive]}>
                    {prompt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.88}>
            <Icon name="mic-outline" size={17} color={VISION_THEME.accent.main} />
            <Text style={styles.secondaryButtonText}>语音对话</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.9} onPress={openPanel}>
            <Icon name="flash-outline" size={17} color={VISION_THEME.accent.dark} />
            <Text style={styles.primaryButtonText}>打开小精灵面板</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 22,
  },
  heroCard: {
    borderRadius: 16,
    backgroundColor: VISION_THEME.surface.base,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  heroTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 21,
    fontWeight: '800',
  },
  heroSubtitle: {
    marginTop: 3,
    color: VISION_THEME.text.secondary,
    fontSize: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(139, 232, 200, 0.38)',
    backgroundColor: 'rgba(139, 232, 200, 0.12)',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: VISION_THEME.feedback.success,
  },
  statusText: {
    color: VISION_THEME.feedback.success,
    fontSize: 11,
    fontWeight: '700',
  },
  block: {
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: VISION_THEME.surface.card,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 11,
  },
  blockTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  capGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  capCard: {
    width: '48.5%',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10, 39, 62, 0.78)',
    paddingVertical: 12,
    alignItems: 'center',
    gap: 5,
  },
  capText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  chatCard: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(9, 35, 56, 0.8)',
    padding: 10,
    gap: 8,
  },
  bubbleAgent: {
    borderRadius: 10,
    backgroundColor: 'rgba(20, 73, 111, 0.65)',
    padding: 9,
  },
  bubbleUser: {
    borderRadius: 10,
    backgroundColor: 'rgba(26, 85, 128, 0.65)',
    padding: 9,
  },
  bubbleLabel: {
    color: VISION_THEME.text.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  bubbleText: {
    marginTop: 3,
    color: VISION_THEME.text.primary,
    fontSize: 12,
    lineHeight: 18,
  },
  promptList: {
    gap: 7,
  },
  promptItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10, 37, 58, 0.72)',
    paddingVertical: 8,
    paddingHorizontal: 9,
  },
  promptItemActive: {
    backgroundColor: VISION_THEME.surface.active,
    borderColor: VISION_THEME.border.strong,
  },
  promptText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
  },
  promptTextActive: {
    color: VISION_THEME.accent.strong,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 2,
  },
  statusPanel: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10, 37, 58, 0.75)',
    padding: 10,
    gap: 4,
  },
  statusLine: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
  },
  statusError: {
    color: VISION_THEME.feedback.danger,
    fontSize: 12,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(10, 38, 60, 0.82)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  secondaryButtonText: {
    color: VISION_THEME.accent.main,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 13,
    backgroundColor: VISION_THEME.accent.strong,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryButtonText: {
    color: VISION_THEME.accent.dark,
    fontSize: 14,
    fontWeight: '800',
  },
});

