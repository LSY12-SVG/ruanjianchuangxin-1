import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {canvasText, glassShadow} from '../../theme/canvasDesign';

export type AppTabKey = 'create' | 'model' | 'agent' | 'community';

const TAB_CONFIG: Array<{
  key: AppTabKey;
  label: string;
  icon: string;
}> = [
  {key: 'create', label: '创作', icon: 'color-wand-outline'},
  {key: 'model', label: '模型', icon: 'cube-outline'},
  {key: 'agent', label: 'Agent', icon: 'sparkles-outline'},
  {key: 'community', label: '社区', icon: 'people-outline'},
];

interface BottomTabBarProps {
  activeTab: AppTabKey;
  onChangeTab: (tab: AppTabKey) => void;
  bottomInset: number;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onChangeTab,
  bottomInset,
}) => {
  return (
    <View style={[styles.wrap, {paddingBottom: Math.max(bottomInset, 8)}]}>
      <View style={styles.tabBar}>
        {TAB_CONFIG.map(tab => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              style={[styles.item, active && styles.itemActive]}
              onPress={() => onChangeTab(tab.key)}>
              <Icon
                name={tab.icon}
                size={18}
                color={active ? '#EAF6FF' : 'rgba(234,246,255,0.64)'}
              />
              <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  tabBar: {
    ...glassShadow,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(156, 209, 255, 0.28)',
    backgroundColor: 'rgba(8, 16, 33, 0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 8,
  },
  item: {
    flex: 1,
    minHeight: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  itemActive: {
    backgroundColor: 'rgba(77,163,255,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(111,231,255,0.4)',
  },
  label: {
    ...canvasText.caption,
    color: 'rgba(234,246,255,0.64)',
  },
  labelActive: {
    color: '#EAF6FF',
    fontWeight: '800',
  },
});
