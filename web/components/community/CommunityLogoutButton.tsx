'use client';

import {useRouter} from 'next/navigation';
import {useState} from 'react';

export default function CommunityLogoutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  return (
    <button
      className="forum-action-button"
      type="button"
      disabled={submitting}
      onClick={async () => {
        setSubmitting(true);
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
          });
        } finally {
          router.push('/login');
          router.refresh();
          setSubmitting(false);
        }
      }}>
      {submitting ? '退出中' : '退出登录'}
    </button>
  );
}
