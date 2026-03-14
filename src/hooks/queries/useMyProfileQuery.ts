import {useQuery} from '@tanstack/react-query';
import {fetchMyProfile, hasAuthToken} from '../../profile/api';

export const useMyProfileQuery = () => {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: fetchMyProfile,
    enabled: hasAuthToken(),
    staleTime: 60 * 1000,
  });
};
