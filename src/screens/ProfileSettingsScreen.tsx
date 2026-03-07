import React, {useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {VISION_THEME} from '../theme/visionTheme';

export const ProfileSettingsScreen: React.FC = () => {
  const [syncOnWifi, setSyncOnWifi] = useState(true);
  const [communityNotify, setCommunityNotify] = useState(true);
  const [voiceAutoApply, setVoiceAutoApply] = useState(true);

  return (
    <LinearGradient
      colors={[
        VISION_THEME.background.top,
        VISION_THEME.background.mid,
        VISION_THEME.background.bottom,
      ]}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Icon name="person" size={24} color={VISION_THEME.accent.main} />
          </View>
          <View style={styles.profileMeta}>
            <Text style={styles.profileName}>lsy</Text>
            <Text style={styles.profileId}>Vision Creator · Pro</Text>
            <Text style={styles.profileInfo}>模型任务 92 · 社区发布 18</Text>
          </View>
          <TouchableOpacity style={styles.editButton} activeOpacity={0.86}>
            <Icon name="create-outline" size={16} color={VISION_THEME.accent.strong} />
          </TouchableOpacity>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>工作流偏好</Text>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>Wi-Fi 下自动同步任务</Text>
              <Text style={styles.settingHint}>上传原图、模型与调色方案</Text>
            </View>
            <Switch
              value={syncOnWifi}
              onValueChange={setSyncOnWifi}
              thumbColor={syncOnWifi ? VISION_THEME.accent.main : '#9ab6d0'}
              trackColor={{false: 'rgba(255,255,255,0.2)', true: 'rgba(122,201,255,0.34)'}}
            />
          </View>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>社区互动通知</Text>
              <Text style={styles.settingHint}>点赞、收藏、评论与复用提醒</Text>
            </View>
            <Switch
              value={communityNotify}
              onValueChange={setCommunityNotify}
              thumbColor={communityNotify ? VISION_THEME.accent.main : '#9ab6d0'}
              trackColor={{false: 'rgba(255,255,255,0.2)', true: 'rgba(122,201,255,0.34)'}}
            />
          </View>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>语音命令结束后自动应用</Text>
              <Text style={styles.settingHint}>关闭后改为“识别完成再确认”</Text>
            </View>
            <Switch
              value={voiceAutoApply}
              onValueChange={setVoiceAutoApply}
              thumbColor={voiceAutoApply ? VISION_THEME.accent.main : '#9ab6d0'}
              trackColor={{false: 'rgba(255,255,255,0.2)', true: 'rgba(122,201,255,0.34)'}}
            />
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>账号与服务</Text>
          {[
            {icon: 'server-outline', label: '模型服务配置', detail: 'SiliconFlow / 本地兜底'},
            {icon: 'shield-checkmark-outline', label: '隐私与权限', detail: '语音、相机、相册权限'},
            {icon: 'cloud-download-outline', label: '缓存与存储', detail: '当前缓存 1.2 GB'},
            {icon: 'help-circle-outline', label: '帮助与反馈', detail: '问题排查、联系我们'},
          ].map(item => (
            <TouchableOpacity key={item.label} style={styles.menuItem} activeOpacity={0.86}>
              <View style={styles.menuIconWrap}>
                <Icon name={item.icon} size={16} color={VISION_THEME.accent.main} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuDetail}>{item.detail}</Text>
              </View>
              <Icon name="chevron-forward" size={16} color={VISION_THEME.text.muted} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutButton} activeOpacity={0.88}>
          <Icon name="log-out-outline" size={17} color={VISION_THEME.feedback.danger} />
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>
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
  profileCard: {
    borderRadius: 16,
    backgroundColor: VISION_THEME.surface.base,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: VISION_THEME.border.strong,
    backgroundColor: 'rgba(18, 61, 94, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileMeta: {
    flex: 1,
  },
  profileName: {
    color: VISION_THEME.text.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  profileId: {
    marginTop: 2,
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  profileInfo: {
    marginTop: 3,
    color: VISION_THEME.text.muted,
    fontSize: 11,
  },
  editButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(18, 58, 89, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
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
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  settingLabel: {
    color: VISION_THEME.text.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  settingHint: {
    marginTop: 2,
    color: VISION_THEME.text.muted,
    fontSize: 11,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  menuIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13, 47, 74, 0.72)',
  },
  menuTextWrap: {
    flex: 1,
  },
  menuLabel: {
    color: VISION_THEME.text.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  menuDetail: {
    marginTop: 2,
    color: VISION_THEME.text.muted,
    fontSize: 11,
  },
  logoutButton: {
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 184, 0.34)',
    backgroundColor: 'rgba(87, 34, 34, 0.36)',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  logoutText: {
    color: VISION_THEME.feedback.danger,
    fontSize: 13,
    fontWeight: '700',
  },
});

