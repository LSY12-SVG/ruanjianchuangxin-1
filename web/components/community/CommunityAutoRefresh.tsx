'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type CommunityAutoRefreshProps = {
  intervalMs?: number;
  label: string;
};

export default function CommunityAutoRefresh({
  intervalMs = 5000,
  label,
}: CommunityAutoRefreshProps) {
  const router = useRouter();
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  useEffect(() => {
    setLastSyncAt(Date.now());

    const intervalId = setInterval(() => {
      setLastSyncAt(Date.now());
      router.refresh();
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [intervalMs, router]);

  return (
    <div className="forum-sync-banner">
      <span className="forum-sync-dot" />
      <span>{label}</span>
      <span className="forum-sync-time">
        最近同步{' '}
        {lastSyncAt
          ? new Intl.DateTimeFormat('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }).format(new Date(lastSyncAt))
          : '--:--:--'}
      </span>
    </div>
  );
}
