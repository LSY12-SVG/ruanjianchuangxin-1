'use client';

import Image from 'next/image';
import {useRouter} from 'next/navigation';
import {type ChangeEvent, useMemo, useRef, useState} from 'react';

import type {CommunityEditableDraft} from '../../lib/community';

type UploadedImage = {
  id: string;
  name: string;
  previewUrl: string;
  status: 'uploading' | 'uploaded' | 'error';
  url?: string;
};

type CreatePostResponse = {
  id: string;
  status: 'draft' | 'published';
};

type UploadImageResponse = {
  url: string;
};

type CommunityCreatePostClientProps = {
  initialDraft: CommunityEditableDraft | null;
};

const MAX_IMAGE_COUNT = 2;

const buildInitialImages = (draft: CommunityEditableDraft | null): UploadedImage[] =>
  (draft?.imageUrls || []).slice(0, MAX_IMAGE_COUNT).map((url, index) => ({
    id: `existing-${index + 1}`,
    name: index === 0 ? 'before-image' : 'after-image',
    previewUrl: url,
    status: 'uploaded',
    url,
  }));

export default function CommunityCreatePostClient({
  initialDraft,
}: CommunityCreatePostClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draftId, setDraftId] = useState(initialDraft?.id || '');
  const [title, setTitle] = useState(initialDraft?.title || '');
  const [content, setContent] = useState(initialDraft?.content || '');
  const [tagsInput, setTagsInput] = useState((initialDraft?.tags || []).join(','));
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>(
    () => buildInitialImages(initialDraft),
  );
  const [submittingMode, setSubmittingMode] = useState<'draft' | 'publish' | ''>('');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const imageSlotsText = useMemo(() => {
    return `${uploadedImages.filter(image => image.status === 'uploaded').length}/${MAX_IMAGE_COUNT}`;
  }, [uploadedImages]);

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    const availableCount = Math.max(0, MAX_IMAGE_COUNT - uploadedImages.length);
    if (availableCount === 0) {
      setFeedbackMessage(`当前最多上传 ${MAX_IMAGE_COUNT} 张图片，用于 before / after 双图展示。`);
      event.target.value = '';
      return;
    }

    const filesToUpload = selectedFiles.slice(0, availableCount);
    setFeedbackMessage('');

    for (const file of filesToUpload) {
      const localId = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(file);

      setUploadedImages(previous => [
        ...previous,
        {
          id: localId,
          name: file.name,
          previewUrl,
          status: 'uploading',
        },
      ]);

      try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/api/community/uploads/images', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {message?: string} | null;
          throw new Error(payload?.message || '上传失败');
        }

        const result = (await response.json()) as UploadImageResponse;
        setUploadedImages(previous =>
          previous.map(image =>
            image.id === localId
              ? {
                  ...image,
                  status: 'uploaded',
                  url: result.url,
                }
              : image,
          ),
        );
      } catch (error) {
        setUploadedImages(previous =>
          previous.map(image =>
            image.id === localId
              ? {
                  ...image,
                  status: 'error',
                }
              : image,
          ),
        );
        setFeedbackMessage(
          error instanceof Error && error.message
            ? error.message
            : '有图片上传失败了，请移除失败图片后继续。',
        );
      }
    }

    event.target.value = '';
  }

  async function handleSubmitPost(mode: 'draft' | 'publish') {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const imageUrls = uploadedImages
      .filter(image => image.status === 'uploaded' && image.url)
      .map(image => image.url as string)
      .slice(0, MAX_IMAGE_COUNT);

    if (!trimmedTitle || !trimmedContent) {
      setFeedbackMessage('请先填写标题和正文。');
      return;
    }

    if (uploadedImages.some(image => image.status === 'uploading')) {
      setFeedbackMessage('还有图片正在上传，请稍等一下再继续。');
      return;
    }

    if (uploadedImages.some(image => image.status === 'error')) {
      setFeedbackMessage('请先移除上传失败的图片，再继续发帖。');
      return;
    }

    setSubmittingMode(mode);
    setFeedbackMessage('');

    try {
      const response = await fetch('/api/community/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: draftId || undefined,
          title: trimmedTitle,
          content: trimmedContent,
          tags: tagsInput
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean),
          imageUrls,
          mode,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | CreatePostResponse
        | {message?: string}
        | null;

      if (!response.ok || !payload || !('id' in payload)) {
        throw new Error(payload && 'message' in payload ? payload.message || '操作失败。' : '操作失败。');
      }

      if (payload.status === 'draft') {
        setDraftId(payload.id);
        router.push(`/community/create?draftId=${payload.id}`);
        router.refresh();
        setFeedbackMessage('草稿已保存，可以继续编辑或直接发布。');
        return;
      }

      router.push(`/community/post/${payload.id}`);
      router.refresh();
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error && error.message ? error.message : '操作失败，请稍后重试。',
      );
    } finally {
      setSubmittingMode('');
    }
  }

  function handleRemoveImage(imageId: string) {
    setUploadedImages(previous => {
      const targetImage = previous.find(image => image.id === imageId);
      if (targetImage && targetImage.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(targetImage.previewUrl);
      }

      return previous.filter(image => image.id !== imageId);
    });
  }

  return (
    <div className="forum-form-wrap">
      <p className="forum-board-intro">
        当前 Web 发帖已直接接入统一社区后端。你在这里保存的草稿或发布的帖子，会和手机端共享同一份社区数据。
      </p>

      <form
        className="forum-publish-form"
        onSubmit={event => {
          event.preventDefault();
          handleSubmitPost('publish').catch(() => undefined);
        }}>
        <label htmlFor="title">标题</label>
        <input
          id="title"
          placeholder="例如：我如何把夜景素材调成更有呼吸感的冷暖结构"
          value={title}
          onChange={event => setTitle(event.target.value)}
        />

        <label htmlFor="content">正文</label>
        <textarea
          id="content"
          placeholder="写下你的创作思路、过程记录和你想邀请社区一起讨论的内容"
          value={content}
          onChange={event => setContent(event.target.value)}
        />

        <label htmlFor="tags">标签</label>
        <input
          id="tags"
          placeholder="例如：夜景调色,工作流,人像"
          value={tagsInput}
          onChange={event => setTagsInput(event.target.value)}
        />

        <div className="forum-upload-header">
          <label htmlFor="images">上传图片</label>
          <span className="forum-upload-count">已上传 {imageSlotsText}</span>
        </div>

        <input
          ref={fileInputRef}
          id="images"
          className="forum-file-input"
          type="file"
          accept="image/*"
          multiple
          onChange={event => {
            handleFileSelection(event).catch(() => {
              setFeedbackMessage('图片处理失败，请重新选择。');
            });
          }}
        />

        <div className="forum-upload-dropzone">
          <div className="forum-upload-copy">
            <strong>选择 before / after 图片</strong>
            <span>当前最多 2 张图片，和移动端保持同一套双图模型，也兼容只传一张图。</span>
          </div>
          <button
            className="forum-action-button forum-action-primary"
            type="button"
            onClick={() => {
              fileInputRef.current?.click();
            }}>
            选择图片
          </button>
        </div>

        {uploadedImages.length > 0 ? (
          <div className="forum-upload-grid">
            {uploadedImages.map(image => (
              <article key={image.id} className="forum-upload-card">
                <div className="forum-upload-preview">
                  <Image
                    src={image.previewUrl}
                    alt={image.name}
                    fill
                    sizes="(max-width: 720px) 100vw, 220px"
                    unoptimized
                  />
                </div>
                <div className="forum-upload-meta">
                  <strong title={image.name}>{image.name}</strong>
                  <span
                    className={[
                      'forum-upload-status',
                      image.status === 'uploaded'
                        ? 'forum-upload-status-success'
                        : image.status === 'error'
                          ? 'forum-upload-status-error'
                          : 'forum-upload-status-pending',
                    ].join(' ')}>
                    {image.status === 'uploaded'
                      ? '上传成功'
                      : image.status === 'error'
                        ? '上传失败'
                        : '上传中'}
                  </span>
                </div>
                <button
                  className="forum-upload-remove"
                  type="button"
                  onClick={() => {
                    handleRemoveImage(image.id);
                  }}>
                  移除
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="forum-empty-state">
            <strong>还没有上传图片</strong>
            <span>你可以先发纯文字帖子，也可以补一张图或 before/after 双图再发布。</span>
          </div>
        )}

        {feedbackMessage ? <p className="bili-feedback-message">{feedbackMessage}</p> : null}

        <div className="forum-button-row">
          <button
            className="forum-action-button"
            type="button"
            disabled={submittingMode !== ''}
            onClick={() => {
              handleSubmitPost('draft').catch(() => undefined);
            }}>
            {submittingMode === 'draft' ? '保存中' : '保存草稿'}
          </button>
          <button
            className="forum-action-button forum-action-primary"
            type="submit"
            disabled={submittingMode !== ''}>
            {submittingMode === 'publish' ? '发布中' : '发布帖子'}
          </button>
          <button
            className="forum-action-button"
            type="button"
            onClick={() => {
              router.push('/community');
            }}>
            返回社区首页
          </button>
        </div>
      </form>
    </div>
  );
}
