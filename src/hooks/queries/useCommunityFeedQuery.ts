import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {COMMUNITY_USER_ID, fetchCommunityFeed, type FeedFilter} from '../../community/api';

export const useCommunityFeedQuery = (filter: FeedFilter) => {
  const key = useMemo(() => ['community', 'feed', filter] as const, [filter]);
  return useQuery({
    queryKey: key,
    queryFn: () => fetchCommunityFeed(filter, 1, 10, COMMUNITY_USER_ID),
  });
};
