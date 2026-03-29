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
  updateMyProfile: jest.fn(async payload => ({
    id: 'u1',
    username: 'vision_user',
    displayName: payload.displayName || 'Vision User',
    avatarUrl: '',
    tier: 'Vision Creator · Pro',
  })),
  updateMySettings: jest.fn(async payload => ({
    syncOnWifi: Boolean(payload.syncOnWifi),
    communityNotify: Boolean(payload.communityNotify),
    voiceAutoApply: Boolean(payload.voiceAutoApply),
  })),
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

const mockPickBeforeFromGallery = jest.fn();
const mockPickAfterFromGallery = jest.fn();
const mockClearBeforeImage = jest.fn();
const mockClearAfterImage = jest.fn();
let mockImagePickerCallCount = 0;

jest.mock('../../src/hooks/useImagePicker', () => ({
  useImagePicker: jest.fn((options: {onImageSelected?: (result: unknown) => void}) => {
    const slot = mockImagePickerCallCount % 2 === 0 ? 'before' : 'after';
    mockImagePickerCallCount += 1;

    if (slot === 'before') {
      return {
        selectedImage: null,
        isLoading: false,
        pickFromGallery: jest.fn(async () => {
          const image = {
            success: true,
            uri: 'file:///before-image.jpg',
            fileName: 'before-image.jpg',
            type: 'image/jpeg',
          };
          options.onImageSelected?.(image);
          mockPickBeforeFromGallery();
          return image;
        }),
        pickFromCamera: jest.fn(),
        clearImage: mockClearBeforeImage,
      };
    }

    return {
      selectedImage: null,
      isLoading: false,
      pickFromGallery: jest.fn(async () => {
        const image = {
          success: true,
          uri: 'file:///after-image.jpg',
          fileName: 'after-image.jpg',
          type: 'image/jpeg',
        };
        options.onImageSelected?.(image);
        mockPickAfterFromGallery();
        return image;
      }),
      pickFromCamera: jest.fn(),
      clearImage: mockClearAfterImage,
    };
  }),
}));

jest.mock('../../src/services/communityHistory', () => ({
  listCommunityHistory: jest.fn(async () => [
    {
      id: 'h1',
      author: {id: 'u2', name: 'History Author', avatarUrl: ''},
      status: 'published',
      title: '浏览过的帖子',
      content: '这是浏览历史里的内容',
      beforeUrl: '',
      afterUrl: '',
      tags: ['历史'],
      gradingParams: {},
      likesCount: 1,
      savesCount: 2,
      commentsCount: 0,
      isLiked: false,
      isSaved: true,
      createdAt: '2026-03-27',
      updatedAt: '2026-03-27',
      viewedAt: '2026-03-28 09:30',
    },
  ]),
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
    getLikedPosts: jest.fn(async () => ({
      items: [
        {
          id: 'l1',
          author: {id: 'u9', name: 'Liked Author', avatarUrl: ''},
          status: 'published',
          title: '最近点赞帖子',
          content: '点赞过的内容',
          beforeUrl: '',
          afterUrl: '',
          tags: ['点赞'],
          gradingParams: {},
          likesCount: 9,
          savesCount: 1,
          commentsCount: 3,
          isLiked: true,
          isSaved: false,
          createdAt: '2026-03-27',
          updatedAt: '2026-03-27',
        },
      ],
      page: 1,
      size: 12,
      total: 1,
      hasMore: false,
    })),
    getSavedPosts: jest.fn(async () => ({
      items: [
        {
          id: 's1',
          author: {id: 'u8', name: 'Saved Author', avatarUrl: ''},
          status: 'published',
          title: '最近收藏帖子',
          content: '收藏过的内容',
          beforeUrl: '',
          afterUrl: '',
          tags: ['收藏'],
          gradingParams: {},
          likesCount: 5,
          savesCount: 8,
          commentsCount: 2,
          isLiked: false,
          isSaved: true,
          createdAt: '2026-03-27',
          updatedAt: '2026-03-27',
        },
      ],
      page: 1,
      size: 12,
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
    uploadPostImage: jest.fn(async (file: {name?: string}) => ({
      url: `https://cdn.test/${file.name || 'image.jpg'}`,
    })),
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
    deletePost: jest.fn(async (postId: string) => ({
      ok: true,
      deletedId: postId,
      deletedStatus: 'published',
    })),
  },
  formatApiErrorMessage: jest.fn((_error: unknown, fallback: string) => fallback),
}));

const {communityApi} = jest.requireMock('../../src/modules/api') as {
  communityApi: {
    getMyPosts: jest.Mock;
    getLikedPosts: jest.Mock;
    getSavedPosts: jest.Mock;
    createDraft: jest.Mock;
    uploadPostImage: jest.Mock;
    publishDraft: jest.Mock;
    deletePost: jest.Mock;
  };
};

const {updateMyProfile, updateMySettings} = jest.requireMock('../../src/profile/api') as {
  updateMyProfile: jest.Mock;
  updateMySettings: jest.Mock;
};

describe('MyScreen', () => {
  beforeEach(() => {
    mockImagePickerCallCount = 0;
    mockPickBeforeFromGallery.mockClear();
    mockPickAfterFromGallery.mockClear();
    mockClearBeforeImage.mockClear();
    mockClearAfterImage.mockClear();
    communityApi.getMyPosts.mockClear();
    communityApi.getLikedPosts.mockClear();
    communityApi.getSavedPosts.mockClear();
    communityApi.createDraft.mockClear();
    communityApi.uploadPostImage.mockClear();
    communityApi.publishDraft.mockClear();
    communityApi.deletePost.mockClear();
    updateMyProfile.mockClear();
    updateMySettings.mockClear();
  });

  it('renders profile summary, recent activity, and creates a draft from the My tab', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<MyScreen />);
    });

    const initialText = JSON.stringify(renderer!.toJSON());
    expect(initialText).toContain('Vision User');
    expect(initialText).toContain('最近点赞');
    expect(initialText).toContain('我的收藏');
    expect(initialText).toContain('历史记录');
    expect(initialText).toContain('草稿标题');
    expect(initialText).toContain('浏览过的帖子');

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

  it('uploads selected images before saving a draft', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<MyScreen />);
    });

    const inputs = renderer!.root.findAllByType(TextInput);
    await act(async () => {
      inputs[0].props.onChangeText('带图帖子');
      inputs[1].props.onChangeText('这里有图片内容');
      inputs[2].props.onChangeText('社区,图片');
    });

    await act(async () => {
      await renderer!.root.findByProps({testID: 'my-pick-before-image-button'}).props.onPress();
      await renderer!.root.findByProps({testID: 'my-pick-after-image-button'}).props.onPress();
    });

    await act(async () => {
      await renderer!.root.findByProps({testID: 'my-save-draft-button'}).props.onPress();
    });

    expect(mockPickBeforeFromGallery).toHaveBeenCalled();
    expect(mockPickAfterFromGallery).toHaveBeenCalled();
    expect(communityApi.uploadPostImage).toHaveBeenCalledTimes(2);
    expect(communityApi.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '带图帖子',
        beforeUrl: 'https://cdn.test/before-image.jpg',
        afterUrl: 'https://cdn.test/after-image.jpg',
      }),
    );
  });

  it('opens profile settings from the gear button and saves account changes', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<MyScreen />);
    });

    await act(async () => {
      renderer!.root.findByProps({testID: 'profile-settings-button'}).props.onPress();
    });

    const settingsInput = renderer!.root.findByProps({testID: 'profile-display-name-input'});
    await act(async () => {
      settingsInput.props.onChangeText('Vision Master');
    });

    await act(async () => {
      renderer!.root.findByProps({testID: 'profile-toggle-community-notify'}).props.onPress();
    });

    await act(async () => {
      renderer!.root.findByProps({testID: 'profile-save-settings-button'}).props.onPress();
    });

    expect(updateMyProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Vision Master',
      }),
    );
    expect(updateMySettings).toHaveBeenCalledWith(
      expect.objectContaining({
        syncOnWifi: true,
        communityNotify: false,
        voiceAutoApply: false,
      }),
    );
  });

  it('deletes a published post from the Mine page', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<MyScreen />);
    });

    await act(async () => {
      renderer!.root.findByProps({testID: 'my-quick-action-published'}).props.onPress();
    });

    await act(async () => {
      renderer!.root.findByProps({testID: 'my-delete-published-p1'}).props.onPress();
    });

    expect(communityApi.deletePost).toHaveBeenCalledWith('p1');
  });
});
