import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {CommunityScreen} from '../../src/screens/CommunityScreen';

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

jest.mock('../../src/modules/api', () => ({
  communityApi: {
    getFeed: jest.fn(async () => ({
      items: [
        {
          id: 'p1',
          author: {id: 'u1', name: 'VisionUser', avatarUrl: ''},
          status: 'published',
          title: '第一条动态',
          content: '社区动态内容',
          beforeUrl: '',
          afterUrl: '',
          tags: ['电影感'],
          gradingParams: {},
          likesCount: 3,
          savesCount: 2,
          commentsCount: 1,
          isLiked: false,
          isSaved: false,
          createdAt: '2026-03-27',
          updatedAt: '2026-03-27',
        },
      ],
      page: 1,
      size: 10,
      total: 1,
      hasMore: false,
    })),
    getComments: jest.fn(async () => ({items: [], page: 1, size: 50, total: 0, hasMore: false})),
    createComment: jest.fn(),
    toggleLike: jest.fn(async () => ({likesCount: 4, liked: true})),
    toggleSave: jest.fn(async () => ({savesCount: 3, saved: true})),
  },
  formatApiErrorMessage: jest.fn((_error: unknown, fallback: string) => fallback),
}));

describe('CommunityScreen', () => {
  it('keeps browse flow and no longer renders draft publishing panel', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <CommunityScreen
          capabilities={[
            {
              module: 'community',
              enabled: true,
              strictMode: true,
              provider: 'local',
              auth: {required: true, scopes: []},
              endpoints: [],
            },
          ]}
        />,
      );
    });

    const text = JSON.stringify(renderer!.toJSON());
    expect(text).toContain('社区动态');
    expect(text).not.toContain('发布草稿');
    expect(text).not.toContain('保存草稿');
  });
});
