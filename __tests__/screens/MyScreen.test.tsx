import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {TextInput} from 'react-native';
import {MyScreen} from '../../src/screens/MyScreen';

jest.mock('../../src/assets/design', () => ({
  HERO_COMMUNITY: 1,
}));

jest.mock('../../src/components/app/PageHero', () => ({
  PageHero: 'PageHero',
}));

jest.mock('../../src/theme/canvasDesign', () => ({
  canvasText: {
    body: {},
    bodyStrong: {},
    bodyMuted: {},
    sectionTitle: {},
    caption: {},
  },
  canvasUi: {
    titleWithIcon: {},
    iconBadge: {},
    input: {},
    chip: {},
    chipActive: {},
    primaryButton: {},
    secondaryButton: {},
    subtleCard: {},
  },
  cardSurfaceWarm: {},
  glassShadow: {},
}));

jest.mock('../../src/profile/api', () => ({
  hasAuthToken: jest.fn(() => true),
}));

jest.mock('../../src/hooks/queries/useMyProfileQuery', () => ({
  useMyProfileQuery: jest.fn(() => ({
    data: {
      profile: {
        id: 'u1',
        username: 'vision_user',
        displayName: 'Vision User',
        avatarUrl: '',
        tier: 'Vision Creator · Pro',
      },
      settings: {
        syncOnWifi: true,
        communityNotify: true,
        voiceAutoApply: false,
      },
      stats: {
        modelTasksCount: 7,
        communityPostsCount: 3,
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  })),
}));

jest.mock('../../src/modules/api', () => ({
  communityApi: {
    getMyPosts: jest.fn(async (status: 'draft' | 'published') => ({
      items:
        status === 'draft'
          ? [
              {
                id: 'd1',
                author: {id: 'u1', name: 'Vision User', avatarUrl: ''},
                status: 'draft',
                title: '草稿标题',
                content: '草稿内容',
                beforeUrl: '',
                afterUrl: '',
                tags: ['草稿'],
                gradingParams: {},
                likesCount: 0,
                savesCount: 0,
                commentsCount: 0,
                isLiked: false,
                isSaved: false,
                createdAt: '2026-03-27',
                updatedAt: '2026-03-27',
              },
            ]
          : [
              {
                id: 'p1',
                author: {id: 'u1', name: 'Vision User', avatarUrl: ''},
                status: 'published',
                title: '已发布标题',
                content: '已发布内容',
                beforeUrl: '',
                afterUrl: '',
                tags: ['发布'],
                gradingParams: {},
                likesCount: 5,
                savesCount: 1,
                commentsCount: 2,
                isLiked: false,
                isSaved: false,
                createdAt: '2026-03-27',
                updatedAt: '2026-03-27',
              },
            ],
      page: 1,
      size: 20,
      total: 1,
      hasMore: false,
    })),
    createDraft: jest.fn(async payload => ({
      id: 'd2',
      author: {id: 'u1', name: 'Vision User', avatarUrl: ''},
      status: 'draft',
      title: payload.title,
      content: payload.content,
      beforeUrl: payload.beforeUrl || '',
      afterUrl: payload.afterUrl || '',
      tags: payload.tags,
      gradingParams: {},
      likesCount: 0,
      savesCount: 0,
      commentsCount: 0,
      isLiked: false,
      isSaved: false,
      createdAt: '2026-03-27',
      updatedAt: '2026-03-27',
    })),
    updateDraft: jest.fn(),
    publishDraft: jest.fn(async () => ({
      id: 'd2',
      author: {id: 'u1', name: 'Vision User', avatarUrl: ''},
      status: 'published',
      title: '新草稿',
      content: '准备发布',
      beforeUrl: '',
      afterUrl: '',
      tags: ['新内容', '社区'],
      gradingParams: {},
      likesCount: 0,
      savesCount: 0,
      commentsCount: 0,
      isLiked: false,
      isSaved: false,
      createdAt: '2026-03-27',
      updatedAt: '2026-03-27',
    })),
  },
  formatApiErrorMessage: jest.fn((_error: unknown, fallback: string) => fallback),
}));

const {communityApi} = jest.requireMock('../../src/modules/api') as {
  communityApi: {
    getMyPosts: jest.Mock;
    createDraft: jest.Mock;
    publishDraft: jest.Mock;
  };
};

describe('MyScreen', () => {
  beforeEach(() => {
    communityApi.getMyPosts.mockClear();
    communityApi.createDraft.mockClear();
    communityApi.publishDraft.mockClear();
  });

  it('renders profile summary and creates a draft from the My tab', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<MyScreen />);
    });

    const initialText = JSON.stringify(renderer!.toJSON());
    expect(initialText).toContain('Vision User');
    expect(initialText).toContain('草稿标题');

    const inputs = renderer!.root.findAllByType(TextInput);
    await act(async () => {
      inputs[0].props.onChangeText('新草稿');
      inputs[1].props.onChangeText('准备发布');
      inputs[2].props.onChangeText('新内容,社区');
    });

    await act(async () => {
      renderer!.root.findByProps({testID: 'my-save-draft-button'}).props.onPress();
    });

    expect(communityApi.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '新草稿',
        content: '准备发布',
        tags: ['新内容', '社区'],
      }),
    );
  });
});
