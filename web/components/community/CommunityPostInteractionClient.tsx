'use client';

import { useRef, useState } from 'react';

import {
  type CommunityComment,
  type CommunityPostDetail,
} from '../../../shared/community/contracts';

type CommunityPostInteractionClientProps = {
  initialComments: CommunityComment[];
  initialPost: CommunityPostDetail;
  postId: string;
};

type ApiCommentResponse = {
  author: {
    avatarUrl?: string;
    id: string;
    name: string;
  };
  content: string;
  id: string;
  postId: string;
  createdAt?: string;
  updatedAt?: string;
};

export default function CommunityPostInteractionClient({
  initialComments,
  initialPost,
  postId,
}: CommunityPostInteractionClientProps) {
  const [post, setPost] = useState(initialPost);
  const [comments, setComments] = useState(initialComments);
  const [draftComment, setDraftComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);

  const actionButtons = [
    {
      active: post.viewerContext.liked,
      count: post.stats.likeCount,
      icon: <ThumbIcon />,
      label: post.viewerContext.liked ? '已点赞' : '点赞',
      onClick: () => {
        handleToggleLike();
      },
    },
    {
      active: false,
      count: post.stats.commentCount,
      icon: <CommentIcon />,
      label: '评论',
      onClick: () => {
        commentInputRef.current?.focus();
        commentInputRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      },
    },
    {
      active: post.viewerContext.favorited,
      count: post.stats.favoriteCount,
      icon: <StarIcon />,
      label: post.viewerContext.favorited ? '已收藏' : '收藏',
      onClick: () => {
        handleToggleFavorite();
      },
    },
  ];

  async function handleToggleLike() {
    const nextLiked = !post.viewerContext.liked;

    setPost(previous => ({
      ...previous,
      stats: {
        ...previous.stats,
        likeCount: Math.max(0, previous.stats.likeCount + (nextLiked ? 1 : -1)),
      },
      viewerContext: {
        ...previous.viewerContext,
        liked: nextLiked,
      },
    }));

    setFeedbackMessage('');

    try {
      const response = await fetch(`/api/community/posts/${postId}/like`, {
        method: nextLiked ? 'POST' : 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to toggle like.');
      }
      const payload = (await response.json().catch(() => null)) as
        | {likesCount?: number; liked?: boolean}
        | null;
      if (payload && typeof payload.likesCount === 'number') {
        const nextLikeCount = payload.likesCount;
        setPost(previous => ({
          ...previous,
          stats: {
            ...previous.stats,
            likeCount: nextLikeCount,
          },
          viewerContext: {
            ...previous.viewerContext,
            liked:
              typeof payload.liked === 'boolean'
                ? payload.liked
                : previous.viewerContext.liked,
          },
        }));
      }
    } catch {
      setPost(previous => ({
        ...previous,
        stats: {
          ...previous.stats,
          likeCount: Math.max(0, previous.stats.likeCount + (nextLiked ? -1 : 1)),
        },
        viewerContext: {
          ...previous.viewerContext,
          liked: !nextLiked,
        },
      }));
      setFeedbackMessage('点赞失败，请稍后重试。');
    }
  }

  async function handleToggleFavorite() {
    const nextFavorited = !post.viewerContext.favorited;

    setPost(previous => ({
      ...previous,
      stats: {
        ...previous.stats,
        favoriteCount: Math.max(
          0,
          previous.stats.favoriteCount + (nextFavorited ? 1 : -1),
        ),
      },
      viewerContext: {
        ...previous.viewerContext,
        favorited: nextFavorited,
      },
    }));

    setFeedbackMessage('');

    try {
      const response = await fetch(`/api/community/posts/${postId}/favorite`, {
        method: nextFavorited ? 'POST' : 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to toggle favorite.');
      }
      const payload = (await response.json().catch(() => null)) as
        | {savesCount?: number; saved?: boolean}
        | null;
      if (payload && typeof payload.savesCount === 'number') {
        const nextFavoriteCount = payload.savesCount;
        setPost(previous => ({
          ...previous,
          stats: {
            ...previous.stats,
            favoriteCount: nextFavoriteCount,
          },
          viewerContext: {
            ...previous.viewerContext,
            favorited:
              typeof payload.saved === 'boolean'
                ? payload.saved
                : previous.viewerContext.favorited,
          },
        }));
      }
    } catch {
      setPost(previous => ({
        ...previous,
        stats: {
          ...previous.stats,
          favoriteCount: Math.max(
            0,
            previous.stats.favoriteCount + (nextFavorited ? -1 : 1),
          ),
        },
        viewerContext: {
          ...previous.viewerContext,
          favorited: !nextFavorited,
        },
      }));
      setFeedbackMessage('收藏失败，请稍后重试。');
    }
  }

  async function handleSubmitComment() {
    const content = draftComment.trim();
    if (!content || isSubmittingComment) {
      return;
    }

    setIsSubmittingComment(true);
    setFeedbackMessage('');

    try {
      const response = await fetch(`/api/community/posts/${postId}/comments`, {
        body: JSON.stringify({ content }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to submit comment.');
      }

      const payload = (await response.json()) as ApiCommentResponse;
      const nextComment = mapApiComment(payload);

      setComments(previous => [...previous, nextComment]);
      setPost(previous => ({
        ...previous,
        stats: {
          ...previous.stats,
          commentCount: previous.stats.commentCount + 1,
        },
      }));
      setDraftComment('');
    } catch {
      setFeedbackMessage('评论发送失败，请稍后再试。');
    } finally {
      setIsSubmittingComment(false);
    }
  }

  return (
    <>
      <div className="forum-post-body">
        <p>{post.content}</p>
      </div>

      <div className="bili-action-bar">
        {actionButtons.map(button => (
          <button
            key={button.label}
            className={[
              'bili-action-button',
              button.active ? 'bili-action-button-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            type="button"
            onClick={button.onClick}
          >
            <span className="bili-action-icon">{button.icon}</span>
            <span className="bili-action-count">{button.count}</span>
            <span className="bili-action-label">{button.label}</span>
          </button>
        ))}
      </div>

      <div className="bili-comment-composer">
        <div className="bili-comment-hint">
          <span>{comments.length} 条评论</span>
          <span>写下你的看法，刷新后两端都能看到同一条评论</span>
        </div>
        <div className="bili-comment-editor">
          <textarea
            ref={commentInputRef}
            className="bili-comment-input"
            placeholder="发一条友善的评论见证当下"
            value={draftComment}
            onChange={event => setDraftComment(event.target.value)}
          />
          <button
            className="bili-comment-submit"
            type="button"
            disabled={isSubmittingComment}
            onClick={() => {
              handleSubmitComment();
            }}
          >
            {isSubmittingComment ? '发送中' : '发送'}
          </button>
        </div>
        {feedbackMessage ? (
          <p className="bili-feedback-message">{feedbackMessage}</p>
        ) : null}
      </div>

      <div className="forum-subsection-title">评论区</div>
      <div className="forum-comment-list">
        {comments.length > 0 ? (
          comments.map(comment => (
            <article key={comment.id} className="forum-comment-item">
              <div className="forum-comment-avatar">{comment.author.avatarText}</div>
              <div className="forum-comment-content">
                <div className="forum-comment-meta">
                  <strong>{comment.author.name}</strong>
                  <span>{formatDate(comment.publishedAt)}</span>
                </div>
                <p>{comment.content}</p>
              </div>
            </article>
          ))
        ) : (
          <div className="forum-empty-state">
            <strong>还没有评论</strong>
            <span>这条帖子还没有人留言，先发一条评论吧。</span>
          </div>
        )}
      </div>
    </>
  );
}

function mapApiComment(comment: ApiCommentResponse): CommunityComment {
  return {
    author: {
      avatarText: comment.author.name.replace(/\s+/g, '').slice(0, 2).toUpperCase(),
      id: comment.author.id,
      name: comment.author.name,
    },
    content: comment.content,
    id: comment.id,
    postId: comment.postId,
    publishedAt: comment.updatedAt || comment.createdAt || new Date().toISOString(),
  };
}

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(isoDate));
}

function ThumbIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10 21h7.2c1.1 0 2-.7 2.2-1.8l1.4-6.5c.3-1.4-.8-2.7-2.2-2.7H14V6.2c0-1.2-.9-2.2-2.1-2.2-.8 0-1.5.4-1.9 1.1L7 10v11h3Z"
        fill="currentColor"
      />
      <path d="M3 10h3v11H3z" fill="currentColor" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7A2.5 2.5 0 0 1 17.5 15H9l-4.5 4v-4A2.5 2.5 0 0 1 2 12.5v-7A2.5 2.5 0 0 1 4 5.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5-4.7-4.6 6.5-.9L12 3Z"
        fill="currentColor"
      />
    </svg>
  );
}
