import {useMutation} from '@tanstack/react-query';
import type {ImagePickerResult} from '../useImagePicker';
import {
  requestSegmentation,
  toLocalMaskLayers,
} from '../../colorEngine/segmentationService';
import type {LocalMaskLayer, SegmentationResult} from '../../types/colorEngine';

interface SegmentationMutationInput {
  image: ImagePickerResult;
}

interface SegmentationMutationOutput {
  segmentation: SegmentationResult;
  localMasks: LocalMaskLayer[];
}

export const useSegmentationMutation = () =>
  useMutation<SegmentationMutationOutput, Error, SegmentationMutationInput>({
    mutationKey: ['segmentation', 'cloud-local-render'],
    mutationFn: async input => {
      const segmentation = await requestSegmentation(input);
      return {
        segmentation,
        localMasks: toLocalMaskLayers(segmentation),
      };
    },
    retry: 1,
  });
