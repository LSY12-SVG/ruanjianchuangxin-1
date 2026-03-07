import {NativeModules} from 'react-native';
import {normalizeInterpretResponse} from './contracts';
import type {InterpretRequest, InterpretResponse} from './types';

const DEFAULT_CLOUD_ENDPOINT = 'http://127.0.0.1:8787/v1/color/interpret';
const MAX_RETRIES = 1;

const timeoutFetch = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const buildEndpointFromScriptURL = (): string | null => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (typeof scriptURL !== 'string' || scriptURL.length === 0) {
    return null;
  }

  try {
    const parsed = new URL(scriptURL);
    if (!parsed.hostname) {
      return null;
    }
    return `${parsed.protocol}//${parsed.hostname}:8787/v1/color/interpret`;
  } catch {
    return null;
  }
};

const resolveCandidateEndpoints = (endpoint?: string): string[] => {
  if (endpoint && endpoint.trim().length > 0) {
    return [endpoint.trim()];
  }

  const candidateSet = new Set<string>();
  const scriptEndpoint = buildEndpointFromScriptURL();
  if (scriptEndpoint) {
    candidateSet.add(scriptEndpoint);
  }

  candidateSet.add(DEFAULT_CLOUD_ENDPOINT);
  candidateSet.add('http://localhost:8787/v1/color/interpret');
  candidateSet.add('http://10.0.2.2:8787/v1/color/interpret');
  candidateSet.add('http://10.0.3.2:8787/v1/color/interpret');

  return Array.from(candidateSet);
};

export const interpretWithCloud = async (
  request: InterpretRequest,
  endpoint?: string,
): Promise<InterpretResponse | null> => {
  const payload = {
    mode: request.mode || 'voice_refine',
    transcript: request.transcript,
    currentParams: request.currentParams,
    locale: request.locale,
    sceneHints: request.sceneHints || ['photo_color_grading', 'mobile_gpu_preview'],
    image: request.image,
    imageStats: request.imageStats,
  };

  const endpoints = resolveCandidateEndpoints(endpoint);

  for (const target of endpoints) {
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      attempt += 1;

      try {
        const response = await timeoutFetch(
          target,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          },
          6000,
        );

        if (!response.ok) {
          throw new Error(`Cloud interpret failed: ${response.status}`);
        }

        const json = await response.json();
        const normalized = normalizeInterpretResponse(json);
        if (normalized) {
          return normalized;
        }

        throw new Error('Cloud interpret schema invalid');
      } catch {
        // Try next attempt / endpoint.
      }
    }
  }

  return null;
};
