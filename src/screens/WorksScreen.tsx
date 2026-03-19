import React, {useMemo} from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {LiquidCard, LiquidPanel, PrimaryButton, StatusStrip, TagPill} from '../components/design';
import {VISION_THEME} from '../theme/visionTheme';
import {getExportHistory} from '../colorEngine/exportService';
import type {ExportHistoryEntry} from '../types/colorEngine';

interface WorksScreenProps {
  filter: 'all' | 'native' | 'degraded';
  onChangeFilter: (filter: 'all' | 'native' | 'degraded') => void;
  onOpenCommunity: () => void;
  onOpenModeling: () => void;
  onOpenSettings: () => void;
  onReuseInEditor: () => void;
}

const FILTERS: Array<{key: 'all' | 'native' | 'degraded'; label: string}> = [
  {key: 'all', label: '全部'},
  {key: 'native', label: '原生导出'},
  {key: 'degraded', label: '降级导出'},
];

const formatExportAt = (value: string): string => {
  if (!value) {
    return '--';
  }
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(
    2,
    '0',
  )}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const byFilter = (
  list: ExportHistoryEntry[],
  filter: 'all' | 'native' | 'degraded',
): ExportHistoryEntry[] => {
  if (filter === 'native') {
    return list.filter(item => item.nativeExportSucceeded);
  }
  if (filter === 'degraded') {
    return list.filter(item => item.degradedExport);
  }
  return list;
};

export const WorksScreen: React.FC<WorksScreenProps> = ({
  filter,
  onChangeFilter,
  onOpenCommunity,
  onOpenModeling,
  onOpenSettings,
  onReuseInEditor,
}) => {
  const history = getExportHistory();
  const filtered = useMemo(() => byFilter(history, filter), [filter, history]);
  const hasHistory = filtered.length > 0;

  return (
    <LinearGradient colors={VISION_THEME.gradients.page} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>作品</Text>
            <StatusStrip
              compact
              items={[
                {label: hasHistory ? `${filtered.length} 条记录` : '暂无记录', icon: 'albums-outline', tone: hasHistory ? 'active' : 'idle'},
                {label: '工具区可扩展', icon: 'construct-outline', tone: 'idle'},
              ]}
            />
          </View>
          <TouchableOpacity style={styles.settingsButton} onPress={onOpenSettings}>
            <Icon name="settings-outline" size={18} color={VISION_THEME.text.secondary} />
          </TouchableOpacity>
        </View>

        <LiquidCard title="筛选" subtitleMode="hidden">
          <View style={styles.filterRow}>
            {FILTERS.map(item => (
              <TagPill
                key={item.key}
                label={item.label}
                active={item.key === filter}
                onPress={() => onChangeFilter(item.key)}
              />
            ))}
          </View>
        </LiquidCard>

        <LiquidCard
          title="工具区"
          subtitleMode="hidden"
          statusNode={
            <StatusStrip
              compact
              items={[
                {label: '社区', icon: 'people-outline', tone: 'active'},
                {label: '2D 转 3D', icon: 'cube-outline', tone: 'active'},
              ]}
            />
          }>
          <View style={styles.tools}>
            <PrimaryButton label="打开社区" icon="people-outline" variant="secondary" onPress={onOpenCommunity} />
            <PrimaryButton label="2D 转 3D" icon="cube-outline" variant="secondary" onPress={onOpenModeling} />
          </View>
        </LiquidCard>

        <LiquidCard title="作品历史" subtitle={hasHistory ? '点击可继续进入编辑器' : '暂无导出记录'}>
          {!hasHistory ? (
            <LiquidPanel style={styles.empty}>
              <Text style={styles.emptyText}>去创作页导入照片并导出后，这里会自动出现历史作品。</Text>
            </LiquidPanel>
          ) : (
            <View style={styles.grid}>
              {filtered.slice(0, 16).map((entry, index) => (
                <LiquidPanel key={`${entry.uri}_${index}`} style={styles.tile}>
                  <TouchableOpacity onPress={onReuseInEditor} activeOpacity={0.9}>
                  <View style={styles.previewWrap}>
                    {entry.galleryUri || entry.uri ? (
                      <Image source={{uri: entry.galleryUri || entry.uri}} style={styles.preview} />
                    ) : null}
                    <View style={styles.previewOverlay}>
                      <Text style={styles.previewMeta}>{entry.spec.format.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.time}>{formatExportAt(entry.exportedAt)}</Text>
                  <StatusStrip
                    compact
                    items={[
                      {
                        label: entry.nativeExportSucceeded ? '原生' : '回退',
                        tone: entry.nativeExportSucceeded ? 'active' : 'warning',
                      },
                      {label: `${entry.spec.bitDepth}bit`, tone: 'idle', pulse: false},
                    ]}
                  />
                  </TouchableOpacity>
                </LiquidPanel>
              ))}
            </View>
          )}
        </LiquidCard>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  content: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 120,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: VISION_THEME.text.primary,
    fontSize: 28,
    fontWeight: '800',
  },
  settingsButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tools: {
    gap: 10,
  },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  emptyText: {
    color: VISION_THEME.text.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '48%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 8,
    gap: 6,
  },
  previewWrap: {
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(8,14,24,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  previewMeta: {
    color: VISION_THEME.text.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  time: {
    color: VISION_THEME.text.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  meta: {
    color: VISION_THEME.text.muted,
    fontSize: 11,
  },
});
