import type {AvatarAssetDescriptor} from './types';

export const assistantAvatarCatalog: AvatarAssetDescriptor[] = [
  {
    id: 'xmas_chibis_elel_silverbell',
    name: 'Elel Silverbell',
    provider: 'Xmas Chibis',
    modelAssetUri: './models/Avatar01_Neutral.vrm',
    thumbnailAssetUri: 'file:///android_asset/assistant/avatar/textures/Avatar01_Neutral_r1.png',
    rendererPageUri: 'file:///android_asset/assistant/avatar/index.html',
  },
];

export const defaultAssistantAvatar = assistantAvatarCatalog[0];
