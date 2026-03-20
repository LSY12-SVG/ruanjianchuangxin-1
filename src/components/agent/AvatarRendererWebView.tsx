import React, {useEffect, useMemo, useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import {createAvatarStateCommand, parseAvatarRendererMessage} from '../../assistant/bridge';
import {defaultAssistantAvatar} from '../../assistant/avatarCatalog';
import type {AssistantAvatarState} from '../../assistant/types';

interface AvatarRendererWebViewProps {
  state: AssistantAvatarState;
  onTap?: () => void;
  onReady?: () => void;
  onError?: (message: string) => void;
}

export const AvatarRendererWebView: React.FC<AvatarRendererWebViewProps> = ({
  state,
  onTap,
  onReady,
  onError,
}) => {
  const webRef = useRef<WebView>(null);

  const source = useMemo(() => {
    const encodedModel = encodeURIComponent(defaultAssistantAvatar.modelAssetUri);
    return {
      uri: `${defaultAssistantAvatar.rendererPageUri}?model=${encodedModel}`,
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      webRef.current?.postMessage(createAvatarStateCommand(state));
    }, 80);
    return () => clearTimeout(timer);
  }, [state]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const payload = parseAvatarRendererMessage(event.nativeEvent.data);
    if (!payload) {
      return;
    }
    if (payload.type === 'loaded') {
      onReady?.();
      return;
    }
    if (payload.type === 'tap') {
      onTap?.();
      return;
    }
    if (payload.type === 'error') {
      onError?.(payload.message || 'avatar_renderer_error');
    }
  };

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webRef}
        source={source}
        originWhitelist={['*']}
        style={styles.webview}
        onMessage={handleMessage}
        onError={event => onError?.(event.nativeEvent.description || 'webview_error')}
        onHttpError={event => onError?.(`http_${event.nativeEvent.statusCode}`)}
        androidLayerType="hardware"
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        allowingReadAccessToURL="file:///android_asset/assistant/avatar/"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
