import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {MotiView} from 'moti';
import {Text} from 'react-native-paper';
import {VISION_THEME} from '../theme/visionTheme';
import {useAgentRuntime} from '../agent/runtimeContext';
import {useAppStore} from '../store/appStore';
import {AppCard} from '../components/ui/AppCard';
import {AppButton} from '../components/ui/AppButton';
import {TopSegment} from '../components/ui/TopSegment';
import {StatusChip} from '../components/ui/StatusChip';

const QUICK_PROMPTS = [
  '帮我规划夜景拍摄参数',
  '生成一套人像电影感调色步骤',
  '把今天素材整理成可发布短视频脚本',
  '根据天气给我最佳构图建议',
];

const AGENT_CAPS = [
  {label: '拍摄建议', icon: 'camera-outline'},
  {label: '调色指导', icon: 'color-filter-outline'},
  {label: '3D编排', icon: 'cube-outline'},
  {label: '发布助手', icon: 'megaphone-outline'},
];

export const AIAgentScreen: React.FC = () => {
  const [segment, setSegment] = useState('ability');
  const [activePrompt, setActivePrompt] = useState(0);
  const {phase, pendingActions, memory, lastMessage, lastError, openPanel} = useAgentRuntime();
  const conversation = useAppStore(state => state.conversation);

  const listData = useMemo(() => {
    if (segment === 'conversation') {
      return conversation.length > 0
        ? conversation.map(item => `${item.role === 'assistant' ? '助手' : '你'}: ${item.content}`)
        : ['暂无会话记录，长按动漫助手开始语音对话'];
    }
    if (segment === 'status') {
      return [
        `阶段: ${phase}`,
        `待确认动作: ${pendingActions.length}`,
        `历史任务: ${memory.history.length}`,
        lastMessage || '暂无最新消息',
        lastError || '系统稳定运行中',
      ];
    }
    return AGENT_CAPS.map(item => item.label);
  }, [conversation, lastError, lastMessage, memory.history.length, pendingActions.length, phase, segment]);

  return (
    <LinearGradient
      colors={[VISION_THEME.background.top, VISION_THEME.background.mid, VISION_THEME.background.bottom]}
      style={styles.container}>
      <FlashList
        data={listData}
        estimatedItemSize={92}
        keyExtractor={(item, index) => `${item}_${index}`}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <MotiView from={{opacity: 0, translateY: 16}} animate={{opacity: 1, translateY: 0}}>
              <AppCard style={styles.heroCard}>
                <View style={styles.heroRow}>
                  <View>
                    <Text style={styles.heroTitle}>Vision Agent</Text>
                    <Text style={styles.heroSubtitle}>跨页面策略中枢与创作执行代理</Text>
                  </View>
                  <StatusChip label="在线" tone="success" />
                </View>
              </AppCard>
            </MotiView>

            <TopSegment
              value={segment}
              onValueChange={setSegment}
              items={[
                {value: 'ability', label: '能力'},
                {value: 'conversation', label: '会话'},
                {value: 'status', label: '状态'},
              ]}
            />

            {segment === 'ability' ? (
              <AppCard style={styles.abilityCard}>
                <View style={styles.capGrid}>
                  {AGENT_CAPS.map(item => (
                    <View key={item.label} style={styles.capItem}>
                      <Icon name={item.icon} size={18} color={VISION_THEME.accent.strong} />
                      <Text style={styles.capText}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </AppCard>
            ) : null}

            <AppCard title="快捷任务" subtitle="一键注入任务目标">
              <View style={styles.promptList}>
                {QUICK_PROMPTS.map((prompt, idx) => {
                  const active = idx === activePrompt;
                  return (
                    <AppButton
                      key={prompt}
                      label={prompt}
                      mode={active ? 'contained' : 'outlined'}
                      onPress={() => setActivePrompt(idx)}
                      style={styles.promptButton}
                    />
                  );
                })}
              </View>
            </AppCard>

            <View style={styles.actionRow}>
              <AppButton label="打开小精灵面板" icon="flash-outline" onPress={openPanel} style={styles.flexBtn} />
              <AppButton label="语音对话" icon="mic-outline" mode="outlined" style={styles.flexBtn} />
            </View>
          </View>
        }
        renderItem={({item, index}) => (
          <MotiView
            from={{opacity: 0, translateY: 10}}
            animate={{opacity: 1, translateY: 0}}
            transition={{type: 'timing', duration: 320, delay: index * 40}}>
            <AppCard style={styles.logCard}>
              <Text style={styles.logText}>{item}</Text>
            </AppCard>
          </MotiView>
        )}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 92,
  },
  heroCard: {
    marginBottom: 10,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  heroTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 22,
    fontWeight: '800',
  },
  heroSubtitle: {
    marginTop: 4,
    color: VISION_THEME.text.secondary,
    fontSize: 12,
  },
  abilityCard: {
    marginBottom: 10,
  },
  capGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  capItem: {
    width: '48.5%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 11,
    alignItems: 'center',
    gap: 5,
  },
  capText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  promptList: {
    gap: 7,
  },
  promptButton: {
    width: '100%',
  },
  actionRow: {
    marginTop: 10,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 8,
  },
  flexBtn: {
    flex: 1,
  },
  logCard: {
    paddingVertical: 11,
  },
  logText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
