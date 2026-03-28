'use client';

import {useRouter, useSearchParams} from 'next/navigation';
import {useMemo, useState} from 'react';

type AuthMode = 'login' | 'register';

export default function CommunityAuthClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const destination = useMemo(
    () => searchParams.get('next') || '/community/me',
    [searchParams],
  );

  const submitLabel =
    mode === 'login' ? (submitting ? '登录中' : '登录并进入社区') : submitting ? '注册中' : '注册并进入社区';

  async function handleSubmit() {
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setFeedbackMessage('请输入用户名和密码。');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setFeedbackMessage('两次输入的密码不一致，请重新确认。');
      return;
    }

    setSubmitting(true);
    setFeedbackMessage('');

    try {
      const response = await fetch(
        mode === 'login' ? '/api/auth/login' : '/api/auth/register',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: trimmedUsername,
            password,
          }),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || '操作失败，请稍后重试。');
      }

      router.push(destination);
      router.refresh();
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error && error.message ? error.message : '操作失败，请稍后重试。',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="forum-form-wrap">
      <p className="forum-board-intro">
        现在 Web 端已经接入当前主账号体系。登录后，你在 Web 和 App 看到的是同一份社区身份与内容。
      </p>

      <div className="forum-mode-switch">
        <button
          className={[
            'forum-mode-chip',
            mode === 'login' ? 'forum-mode-chip-active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          type="button"
          onClick={() => {
            setMode('login');
            setFeedbackMessage('');
          }}>
          登录
        </button>
        <button
          className={[
            'forum-mode-chip',
            mode === 'register' ? 'forum-mode-chip-active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          type="button"
          onClick={() => {
            setMode('register');
            setFeedbackMessage('');
          }}>
          注册
        </button>
      </div>

      <form
        className="forum-publish-form"
        onSubmit={event => {
          event.preventDefault();
          handleSubmit().catch(() => undefined);
        }}>
        <label htmlFor="auth-username">用户名</label>
        <input
          id="auth-username"
          placeholder="输入用户名"
          value={username}
          onChange={event => setUsername(event.target.value)}
        />

        <label htmlFor="auth-password">密码</label>
        <input
          id="auth-password"
          type="password"
          placeholder="输入密码"
          value={password}
          onChange={event => setPassword(event.target.value)}
        />

        {mode === 'register' ? (
          <>
            <label htmlFor="auth-confirm-password">确认密码</label>
            <input
              id="auth-confirm-password"
              type="password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
            />
          </>
        ) : null}

        {feedbackMessage ? <p className="bili-feedback-message">{feedbackMessage}</p> : null}

        <div className="forum-button-row">
          <button className="forum-action-button forum-action-primary" type="submit" disabled={submitting}>
            {submitLabel}
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
