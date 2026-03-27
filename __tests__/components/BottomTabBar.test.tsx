import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {BottomTabBar} from '../../src/components/app/BottomTabBar';

jest.mock('../../src/theme/canvasDesign', () => ({
  canvasText: {
    caption: {},
  },
  glassShadow: {},
}));

jest.mock('../../src/theme/visionTheme', () => ({
  VISION_THEME: {
    surface: {
      nav: 'rgba(30,20,20,0.8)',
    },
    motionPresets: {
      press: {
        duration: 100,
        activeScale: 0.96,
      },
    },
  },
}));

const flattenText = (node: unknown): string => {
  if (typeof node === 'string') {
    return node;
  }
  if (!node || typeof node !== 'object') {
    return '';
  }
  const candidate = node as {children?: unknown[]};
  if (!Array.isArray(candidate.children)) {
    return '';
  }
  return candidate.children.map(item => flattenText(item)).join('');
};

describe('BottomTabBar', () => {
  it('renders five tabs including 我的 and triggers profile change', async () => {
    const onChangeTab = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <BottomTabBar activeTab="create" onChangeTab={onChangeTab} bottomInset={0} />,
      );
    });

    const treeText = flattenText(renderer!.toJSON());
    expect(treeText).toContain('创作');
    expect(treeText).toContain('模型');
    expect(treeText).toContain('Agent');
    expect(treeText).toContain('社区');
    expect(treeText).toContain('我的');

    const profileButton = renderer!.root.findByProps({testID: 'tab-profile'});

    expect(profileButton).toBeTruthy();

    await act(async () => {
      profileButton!.props.onPress();
    });

    expect(onChangeTab).toHaveBeenCalledWith('profile');
  });
});
