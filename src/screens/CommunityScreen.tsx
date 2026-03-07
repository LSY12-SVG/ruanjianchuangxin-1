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

type FeedFilter = 'all' | 'portrait' | 'cinema' | 'vintage';

interface PostCard {
  id: string;
  author: string;
  title: string;
  tags: string[];
  likes: number;
  saves: number;
}

const POSTS: PostCard[] = [
  {
    id: '1',
    author: 'LingFilm',
    title: '人像夜景通透感调色流程',
    tags: ['人像', '夜景', '青橙'],
    likes: 421,
    saves: 188,
  },
  {
    id: '2',
    author: 'Ari_Visual',
    title: '雨天街拍冷调电影风 LUT 思路',
    tags: ['电影感', '雨天', '冷调'],
    likes: 307,
    saves: 146,
  },
  {
    id: '3',
    author: 'StudioM',
    title: '复古褪色但保持肤色健康的参数',
    tags: ['复古', '肤色', '教程'],
    likes: 285,
    saves: 120,
  },
];

const FILTERS: Array<{key: FeedFilter; label: string}> = [
  {key: 'all', label: '全部'},
  {key: 'portrait', label: '人像'},
  {key: 'cinema', label: '电影感'},
  {key: 'vintage', label: '复古'},
];

export const CommunityScreen: React.FC = () => {
  const [filter, setFilter] = useState<FeedFilter>('all');

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
            <Text style={styles.heroTitle}>调色社区</Text>
            <Text style={styles.heroSubtitle}>分享参数、前后对比与创作流程</Text>
          </View>
          <TouchableOpacity style={styles.publishButton} activeOpacity={0.86}>
            <Icon name="add-circle-outline" size={16} color={VISION_THEME.accent.dark} />
            <Text style={styles.publishButtonText}>发布作品</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map(item => {
            const active = item.key === filter;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
                activeOpacity={0.85}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.feed}>
          {POSTS.map(post => (
            <View key={post.id} style={styles.postCard}>
              <View style={styles.postHeader}>
                <View>
                  <Text style={styles.author}>{post.author}</Text>
                  <Text style={styles.title}>{post.title}</Text>
                </View>
                <TouchableOpacity activeOpacity={0.86}>
                  <Icon name="ellipsis-horizontal" size={18} color={VISION_THEME.text.muted} />
                </TouchableOpacity>
              </View>

              <View style={styles.previewRow}>
                <View style={styles.previewBefore}>
                  <Text style={styles.previewLabel}>Before</Text>
                </View>
                <View style={styles.previewAfter}>
                  <Text style={styles.previewLabel}>After</Text>
                </View>
              </View>

              <View style={styles.tagRow}>
                {post.tags.map(tag => (
                  <View key={tag} style={styles.tagPill}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Icon name="heart-outline" size={14} color={VISION_THEME.text.secondary} />
                  <Text style={styles.metricText}>{post.likes}</Text>
                </View>
                <View style={styles.metricItem}>
                  <Icon name="bookmark-outline" size={14} color={VISION_THEME.text.secondary} />
                  <Text style={styles.metricText}>{post.saves}</Text>
                </View>
                <TouchableOpacity style={styles.metricAction} activeOpacity={0.85}>
                  <Icon name="share-social-outline" size={14} color={VISION_THEME.accent.main} />
                  <Text style={styles.metricActionText}>复用参数</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
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
    paddingBottom: 20,
  },
  heroCard: {
    borderRadius: 16,
    backgroundColor: VISION_THEME.surface.base,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  heroTitle: {
    color: VISION_THEME.text.primary,
    fontSize: 21,
    fontWeight: '700',
  },
  heroSubtitle: {
    marginTop: 4,
    color: VISION_THEME.text.secondary,
    fontSize: 12,
  },
  publishButton: {
    borderRadius: 12,
    backgroundColor: VISION_THEME.accent.strong,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  publishButtonText: {
    color: VISION_THEME.accent.dark,
    fontSize: 12,
    fontWeight: '800',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 10,
  },
  filterChip: {
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(11, 43, 68, 0.8)',
  },
  filterChipActive: {
    borderColor: VISION_THEME.border.strong,
    backgroundColor: VISION_THEME.surface.active,
  },
  filterChipText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: VISION_THEME.accent.strong,
  },
  feed: {
    gap: 10,
  },
  postCard: {
    borderRadius: 14,
    backgroundColor: VISION_THEME.surface.card,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 11,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  author: {
    color: VISION_THEME.text.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    marginTop: 3,
    color: VISION_THEME.text.primary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 8,
  },
  previewBefore: {
    flex: 1,
    borderRadius: 11,
    minHeight: 110,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(34, 58, 79, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAfter: {
    flex: 1,
    borderRadius: 11,
    minHeight: 110,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(17, 78, 122, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLabel: {
    color: VISION_THEME.text.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  tagRow: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    borderRadius: 10,
    backgroundColor: 'rgba(122, 201, 255, 0.14)',
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    color: VISION_THEME.accent.strong,
    fontSize: 11,
    fontWeight: '600',
  },
  metricRow: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  metricAction: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(14, 55, 84, 0.86)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  metricActionText: {
    color: VISION_THEME.accent.main,
    fontSize: 11,
    fontWeight: '700',
  },
});

