import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Text} from 'react-native-paper';
import Icon from 'react-native-vector-icons/Ionicons';
import {FlashList} from '@shopify/flash-list';
import {MotiView} from 'moti';
import type {HomeRouteKey} from '../types/navigation';
import {VISION_THEME} from '../theme/visionTheme';
import {useAppStore} from '../store/appStore';
import {AppCard} from '../components/ui/AppCard';
import {AppButton} from '../components/ui/AppButton';
import {SectionHeader} from '../components/ui/SectionHeader';
import {StatusChip} from '../components/ui/StatusChip';
import {AdvancedImageCard} from '../components/media/AdvancedImageCard';
import {useCommunityFeedQuery} from '../hooks/queries/useCommunityFeedQuery';

interface HomeHubScreenProps {
  onNavigateModule: (route: Exclude<HomeRouteKey, 'hub'>) => void;
}

const MODULES: Array<{
  key: Exclude<HomeRouteKey, 'hub'>;
  title: string;
  subtitle: string;
  icon: string;
}> = [
  {
    key: 'grading',
    title: '智能调色模块',
    subtitle: 'GPU 实时预览 + 语音精修 + 导出',
    icon: 'color-filter-outline',
  },
  {
    key: 'modeling',
    title: '2D 转 3D 模块',
    subtitle: '多策略重建 + 流程追踪 + 任务进度',
    icon: 'cube-outline',
  },
];

export const HomeHubScreen: React.FC<HomeHubScreenProps> = ({onNavigateModule}) => {
  const {recentTasks} = useAppStore();
  const feedQuery = useCommunityFeedQuery('all');

  const listData = useMemo(() => {
    const fromFeed = (feedQuery.data?.items || []).slice(0, 3).map(item => `社区热帖 · ${item.title}`);
    const merged = [...recentTasks, ...fromFeed];
    if (merged.length > 0) {
      return merged;
    }
    return ['调色工作流 · 夜景电影感', '建模工作流 · 产品快速重建'];
  }, [feedQuery.data?.items, recentTasks]);

  return (
    <LinearGradient
      colors={VISION_THEME.gradients.page}
      style={styles.container}>
      <FlashList
        data={listData}
        estimatedItemSize={88}
        contentContainerStyle={styles.content}
        keyExtractor={(item, index) => `${item}_${index}`}
        ListHeaderComponent={
          <View>
            <MotiView
              from={{opacity: 0, translateY: 16}}
              animate={{opacity: 1, translateY: 0}}
              transition={{type: 'timing', duration: 420}}>
              <AppCard style={styles.heroCard}>
                <SectionHeader title="VisionGenie 首页" subtitle="创作中枢 · 调色与建模统一入口" />
                <StatusChip label="高性能模式已启用" tone="success" />
              </AppCard>
            </MotiView>

            <SectionHeader title="创作模块" subtitle="选择模块继续创作" />
            {MODULES.map((module, index) => (
              <MotiView
                key={module.key}
                from={{opacity: 0, translateY: 18}}
                animate={{opacity: 1, translateY: 0}}
                transition={{type: 'timing', duration: 430, delay: 60 * (index + 1)}}>
                <AppCard style={styles.moduleCard}>
                  <View style={styles.moduleHead}>
                    <View style={styles.moduleTitleWrap}>
                      <Icon name={module.icon} size={20} color={VISION_THEME.accent.strong} />
                      <View style={styles.moduleTitleText}>
                        <Text style={styles.moduleTitle}>{module.title}</Text>
                        <Text style={styles.moduleSub}>{module.subtitle}</Text>
                      </View>
                    </View>
                    <AppButton
                      label="进入"
                      icon="arrow-forward"
                      onPress={() => onNavigateModule(module.key)}
                      style={styles.moduleAction}
                    />
                  </View>
                  <AdvancedImageCard
                    label={module.key === 'grading' ? 'Color Pipeline' : 'Model Pipeline'}
                    preset={module.key === 'grading' ? 'vivid' : 'editorial'}
                    style={styles.cover}
                  />
                </AppCard>
              </MotiView>
            ))}

            <SectionHeader title="最近任务" subtitle="可通过小精灵继续执行" />
          </View>
        }
        renderItem={({item, index}) => (
          <MotiView
            from={{opacity: 0, translateY: 12}}
            animate={{opacity: 1, translateY: 0}}
            transition={{type: 'timing', duration: 360, delay: 80 + index * 40}}>
            <AppCard style={styles.taskCard}>
              <Text style={styles.taskText}>{item}</Text>
            </AppCard>
          </MotiView>
        )}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 96,
  },
  heroCard: {
    marginBottom: 10,
  },
  moduleCard: {
    marginBottom: 10,
  },
  moduleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  moduleTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  moduleTitleText: {
    flex: 1,
  },
  moduleTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  moduleSub: {
    marginTop: 2,
    color: VISION_THEME.text.muted,
    fontSize: 12,
  },
  moduleAction: {
    minWidth: 84,
  },
  cover: {
    height: 96,
  },
  taskCard: {
    paddingVertical: 12,
  },
  taskText: {
    color: VISION_THEME.text.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
});
