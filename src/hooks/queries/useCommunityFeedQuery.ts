import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {communityApi} from '../../modules/api';

export type FeedFilter = 'all' | 'portrait' | 'cinema' | 'vintage';

export const useCommunityFeedQuery = (filter: FeedFilter) => {
  const key = useMemo(() => ['community', 'feed', filter] as const, [filter]);
  return useQuery({
    queryKey: key,
    queryFn: () => communityApi.getFeed(1, 10, filter),
  });
};
