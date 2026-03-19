import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  ImageCompareView,
  LiquidCard,
  LiquidSuggestionTile,
  PrimaryButton,
  StatusStrip,
} from '../components/design';
import {VISION_THEME} from '../theme/visionTheme';

interface CreateHubScreenProps {
  onImportPhoto: () => void;
  onContinueEdit: () => void;
  onApplySuggestion: (goal: string) => void;
}

const SUGGESTIONS = [
  {
    title: '夜景电影感',
    subtitle: '压高光、提暗部层次，保留霓虹细节与街景氛围。',
    goal: '请应用夜景电影感首轮调色建议',
  },
  {
    title: '人像柔光',
    subtitle: '肤色更自然，降低皮肤噪点并保留五官立体感。',
    goal: '请生成适合人像的柔和肤色调色方案',
  },
  {
    title: '旅行纪实',
    subtitle: '提升色彩统一性与天空通透度，适合社媒发布。',
    goal: '请给我旅行纪实风格的快速调色建议',
  },
];

export const CreateHubScreen: React.FC<CreateHubScreenProps> = ({
  onImportPhoto,
  onContinueEdit,
  onApplySuggestion,
}) => {
  return (
    <LinearGradient colors={VISION_THEME.gradients.page} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LiquidCard
          title="创作工作台"
          subtitle="3 秒启动：导入、编辑、应用 AI 建议"
          statusNode={
            <StatusStrip
              compact
              items={[
                {label: '导入优先', icon: 'images-outline', tone: 'active'},
                {label: 'AI 建议', icon: 'sparkles-outline', tone: 'active'},
              ]}
            />
          }>
          <View style={styles.actions}>
            <PrimaryButton
              label="导入照片开始"
              icon="images-outline"
              onPress={onImportPhoto}
              focusPulse
            />
            <PrimaryButton
              label="继续上次编辑"
              icon="play-forward-outline"
              variant="secondary"
              onPress={onContinueEdit}
            />
          </View>
        </LiquidCard>

        <LiquidCard
          title="AI 优化预览"
          subtitleMode="hidden"
          statusNode={
            <StatusStrip
              compact
              items={[{label: '拖动对比', icon: 'swap-horizontal-outline', tone: 'idle'}]}
            />
          }>
          <ImageCompareView />
        </LiquidCard>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>AI 推荐方案</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {SUGGESTIONS.map(item => (
            <LiquidSuggestionTile
              key={item.title}
              title={item.title}
              subtitle={item.subtitle}
              onApply={() => onApplySuggestion(item.goal)}
            />
          ))}
        </ScrollView>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 120,
  },
  actions: {
    gap: 10,
  },
  sectionHead: {
    marginTop: 4,
    gap: 3,
  },
  sectionTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  row: {
    gap: 10,
    paddingRight: 16,
  },
});
