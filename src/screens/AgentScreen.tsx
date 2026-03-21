import React, {useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  agentApi,
  formatApiErrorMessage,
  type AgentExecuteResponse,
  type AgentPlanResponse,
  type ModuleCapabilityItem,
} from '../modules/api';
import {PageHero} from '../components/app/PageHero';
import {HERO_AGENT} from '../assets/design';
import {canvasText, cardSurfaceViolet, glassShadow} from '../theme/canvasDesign';

const QUICK_PROMPTS: Array<{
  icon: string;
  label: string;
  prompt: string;
}> = [
  {
    icon: '🎨',
    label: '批量调色',
    prompt: '根据当前状态给我一个调色优化执行计划',
  },
  {
    icon: '📦',
    label: '3D 任务',
    prompt: '先规划 2D 转 3D 任务，再给出下一步建议',
  },
  {
    icon: '📝',
    label: '社区发布',
    prompt: '帮我规划并执行一次社区草稿发布流程',
  },
];

interface AgentScreenProps {
  capabilities: ModuleCapabilityItem[];
}

export const AgentScreen: React.FC<AgentScreenProps> = ({capabilities}) => {
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<AgentPlanResponse | null>(null);
  const [executeResult, setExecuteResult] = useState<AgentExecuteResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [errorText, setErrorText] = useState('');

  const agentCapability = capabilities.find(item => item.module === 'agent');

  const planStatusText = useMemo(() => {
    if (!plan) {
      return '等待生成计划';
    }
    return `${plan.estimatedSteps} steps · ${plan.plannerSource}`;
  }, [plan]);

  const executeProgress = useMemo(() => {
    if (!executeResult || !executeResult.actionResults.length) {
      return 0;
    }
    const completed = executeResult.actionResults.filter(
      item => item.status === 'applied',
    ).length;
    return Math.round((completed / executeResult.actionResults.length) * 100);
  }, [executeResult]);

  const createPlan = async () => {
    if (!prompt.trim()) {
      setErrorText('请输入任务目标');
      return;
    }
    try {
      setLoadingPlan(true);
      setErrorText('');
      setExecuteResult(null);
      const nextPlan = await agentApi.createPlan(prompt.trim());
      setPlan(nextPlan);
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '计划生成失败'));
    } finally {
      setLoadingPlan(false);
    }
  };

  const executePlan = async () => {
    if (!plan) {
      setErrorText('请先生成计划');
      return;
    }
    try {
      setLoadingExecute(true);
      setErrorText('');
      const result = await agentApi.executePlan(plan.planId, plan.actions);
      setExecuteResult(result);
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '计划执行失败'));
    } finally {
      setLoadingExecute(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <PageHero
        image={HERO_AGENT}
        title="AI Agent"
        subtitle="plan → review → execute"
        overlayColors={[
          'rgba(10, 8, 20, 0.15)',
          'rgba(42, 16, 46, 0.7)',
          'rgba(70, 28, 64, 0.92)',
        ]}
      />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>任务目标</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChipRow}>
          {QUICK_PROMPTS.map(item => (
            <Pressable key={item.label} style={styles.quickChip} onPress={() => setPrompt(item.prompt)}>
              <Text style={styles.quickChipIcon}>{item.icon}</Text>
              <Text style={styles.quickChipText}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          style={styles.input}
          multiline
          placeholder="例如：先自动调色，再生成3D模型并准备社区发布草稿"
          placeholderTextColor="rgba(210,185,220,0.58)"
        />
        <View style={styles.actionRow}>
          <Pressable style={styles.primaryBtn} onPress={createPlan} disabled={loadingPlan}>
            <Icon name="sparkles-outline" size={15} color="#1F0F2C" />
            <Text style={styles.primaryBtnText}>{loadingPlan ? '生成中...' : '生成计划'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={executePlan} disabled={!plan || loadingExecute}>
            <Icon name="play-outline" size={15} color="#EAF6FF" />
            <Text style={styles.secondaryBtnText}>{loadingExecute ? '执行中...' : '确认执行'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>计划摘要</Text>
        <Text style={styles.metaText}>{planStatusText}</Text>
        {plan ? (
          <View style={styles.stepWrap}>
            {plan.actions.map((action, index) => (
              <View key={action.actionId} style={styles.stepCard}>
                <View style={styles.stepHead}>
                  <Text style={styles.stepIndex}>#{index + 1}</Text>
                  <Text style={styles.stepDomain}>{action.domain}</Text>
                  <Text style={styles.stepOp}>{action.operation}</Text>
                </View>
                <Text style={styles.stepMeta}>
                  risk: {action.riskLevel} | confirm: {action.requiresConfirmation ? 'yes' : 'no'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.metaText}>生成计划后会展示步骤</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>执行结果</Text>
        {executeResult ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {width: `${executeProgress}%`}]} />
            </View>
            <Text style={styles.progressText}>{executeProgress}%</Text>
          </View>
        ) : null}
        {executeResult ? (
          <View style={styles.stepWrap}>
            <Text style={styles.metaText}>status: {executeResult.status}</Text>
            {executeResult.actionResults.map(result => (
              <View key={result.action.actionId} style={styles.stepCard}>
                <Text style={styles.stepDomain}>
                  {result.action.domain} · {result.action.operation}
                </Text>
                <Text style={styles.stepMeta}>
                  {result.status} {result.errorCode ? `(${result.errorCode})` : ''}
                </Text>
                <Text style={styles.stepMeta}>{result.message}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.metaText}>等待执行</Text>
        )}
        {errorText ? <Text style={styles.errorText}>错误: {errorText}</Text> : null}
        <Text style={styles.metaText}>
          strictMode: {agentCapability?.strictMode ? 'ON' : 'UNKNOWN'} | auth:{' '}
          {agentCapability?.auth?.required ? 'JWT' : 'none'}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {gap: 14, paddingBottom: 24},
  card: {
    ...cardSurfaceViolet,
    ...glassShadow,
    padding: 14,
    gap: 12,
  },
  sectionTitle: {
    ...canvasText.sectionTitle,
    color: '#F7E7FF',
  },
  input: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(237,157,255,0.26)',
    backgroundColor: 'rgba(35, 18, 49, 0.86)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 90,
    textAlignVertical: 'top',
    color: '#F7E7FF',
    ...canvasText.body,
  },
  quickChipRow: {
    gap: 8,
    paddingRight: 10,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(237,157,255,0.22)',
    backgroundColor: 'rgba(46, 25, 61, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quickChipIcon: {
    ...canvasText.body,
  },
  quickChipText: {
    ...canvasText.bodyStrong,
    color: 'rgba(247,231,255,0.92)',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: '#F2A7FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#1F0F2C',
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(237,157,255,0.3)',
    backgroundColor: 'rgba(33, 18, 46, 0.76)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  secondaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#F7E7FF',
  },
  stepWrap: {
    gap: 9,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(247,231,255,0.14)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#F2A7FF',
  },
  progressText: {
    ...canvasText.caption,
    color: '#F2A7FF',
    minWidth: 32,
    textAlign: 'right',
  },
  stepCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,157,255,0.22)',
    backgroundColor: 'rgba(35, 18, 49, 0.9)',
    padding: 11,
    gap: 5,
  },
  stepHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepIndex: {
    ...canvasText.caption,
    color: '#F2A7FF',
  },
  stepDomain: {
    ...canvasText.bodyStrong,
    color: '#F7E7FF',
  },
  stepOp: {
    ...canvasText.bodyMuted,
    color: 'rgba(247,231,255,0.75)',
  },
  stepMeta: {
    ...canvasText.bodyMuted,
    color: 'rgba(247,231,255,0.72)',
    lineHeight: 16,
  },
  metaText: {
    ...canvasText.body,
    color: 'rgba(247,231,255,0.72)',
    lineHeight: 18,
  },
  errorText: {
    ...canvasText.body,
    color: '#FFB8C8',
  },
});
