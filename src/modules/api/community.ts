import {requestApi} from './http';
import type {CommunityComment, CommunityPost, Pagination} from './types';

interface CommunityUploadFile {
  uri: string;
  name?: string;
  type?: string;
}

export const communityApi = {
  async getFeed(
    page = 1,
    size = 10,
    filter: 'all' | 'portrait' | 'cinema' | 'vintage' = 'all',
  ): Promise<Pagination<CommunityPost>> {
    return requestApi<Pagination<CommunityPost>>(
      `/v1/modules/community/feed?page=${page}&size=${size}&filter=${filter}`,
    );
  },

  async getMyPosts(
    status: 'draft' | 'published',
    page = 1,
    size = 10,
  ): Promise<Pagination<CommunityPost>> {
    return requestApi<Pagination<CommunityPost>>(
      `/v1/modules/community/me/posts?status=${status}&page=${page}&size=${size}`,
      {auth: true},
    );
  },

  async getLikedPosts(page = 1, size = 10): Promise<Pagination<CommunityPost>> {
    return requestApi<Pagination<CommunityPost>>(
      `/v1/modules/community/me/liked?page=${page}&size=${size}`,
      {auth: true},
    );
  },

  async getSavedPosts(page = 1, size = 10): Promise<Pagination<CommunityPost>> {
    return requestApi<Pagination<CommunityPost>>(
      `/v1/modules/community/me/saved?page=${page}&size=${size}`,
      {auth: true},
    );
  },

  async uploadPostImage(file: CommunityUploadFile): Promise<{url: string}> {
    const form = new FormData();
    form.append(
      'image',
      {
        uri: file.uri,
        name: file.name || 'community-image.jpg',
        type: file.type || 'image/jpeg',
      } as any,
    );
    return requestApi<{url: string}>('/v1/modules/community/uploads/images', {
      method: 'POST',
      auth: true,
      body: form,
    });
  },

  async createDraft(payload: {
    title: string;
    content: string;
    tags: string[];
    beforeUrl?: string;
    afterUrl?: string;
    gradingParams?: Record<string, unknown>;
  }): Promise<CommunityPost> {
    const response = await requestApi<{item: CommunityPost}>('/v1/modules/community/drafts', {
      method: 'POST',
      auth: true,
      body: payload,
    });
    return response.item;
  },

  async updateDraft(
    draftId: string,
    payload: {
      title: string;
      content: string;
      tags: string[];
      beforeUrl?: string;
      afterUrl?: string;
      gradingParams?: Record<string, unknown>;
    },
  ): Promise<CommunityPost> {
    const response = await requestApi<{item: CommunityPost}>(
      `/v1/modules/community/drafts/${encodeURIComponent(draftId)}`,
      {
        method: 'PUT',
        auth: true,
        body: payload,
      },
    );
    return response.item;
  },

  async publishDraft(draftId: string): Promise<CommunityPost> {
    const response = await requestApi<{item: CommunityPost}>(
      `/v1/modules/community/drafts/${encodeURIComponent(draftId)}/publish`,
      {
        method: 'POST',
        auth: true,
      },
    );
    return response.item;
  },

  async toggleLike(postId: string, liked: boolean): Promise<{likesCount: number; liked: boolean}> {
    return requestApi(`/v1/modules/community/posts/${encodeURIComponent(postId)}/like`, {
      method: 'POST',
      auth: true,
      body: {liked},
    });
  },

  async toggleSave(postId: string, saved: boolean): Promise<{savesCount: number; saved: boolean}> {
    return requestApi(`/v1/modules/community/posts/${encodeURIComponent(postId)}/save`, {
      method: 'POST',
      auth: true,
      body: {saved},
    });
  },

  async getComments(postId: string, page = 1, size = 20): Promise<Pagination<CommunityComment>> {
    return requestApi<Pagination<CommunityComment>>(
      `/v1/modules/community/posts/${encodeURIComponent(postId)}/comments?page=${page}&size=${size}`,
    );
  },

  async createComment(
    postId: string,
    content: string,
    parentId?: string | null,
  ): Promise<CommunityComment> {
    const response = await requestApi<{item: CommunityComment}>(
      `/v1/modules/community/posts/${encodeURIComponent(postId)}/comments`,
      {
        method: 'POST',
        auth: true,
        body: {
          content,
          parentId: parentId || null,
        },
      },
    );
    return response.item;
  },
};

