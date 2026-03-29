import {NativeModules} from 'react-native';

export interface SaveRemoteFileInput {
  url: string;
  fileName?: string;
  mimeType?: string;
  target?: 'downloads' | 'photos' | 'documents';
}

export interface SaveRemoteFileResult {
  uri: string;
  savedTo: 'downloads' | 'photos' | 'documents';
  fileName: string;
}

interface FileTransferNativeModule {
  saveRemoteFile(input: SaveRemoteFileInput): Promise<SaveRemoteFileResult>;
}

const nativeModule = NativeModules?.FileTransferModule as FileTransferNativeModule | undefined;

export const saveRemoteFile = async (
  input: SaveRemoteFileInput,
): Promise<SaveRemoteFileResult> => {
  if (!nativeModule?.saveRemoteFile) {
    throw new Error('file_transfer_not_available');
  }
  return nativeModule.saveRemoteFile(input);
};
