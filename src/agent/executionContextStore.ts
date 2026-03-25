import {create} from 'zustand';
import type {ColorRequestContext} from '../modules/api';

export interface AgentModelingImageContext {
  image: {
    mimeType: string;
    fileName: string;
    base64: string;
  };
}

interface AgentExecutionContextState {
  colorContext: ColorRequestContext | null;
  modelingImageContext: AgentModelingImageContext | null;
  setColorContext: (context: ColorRequestContext | null) => void;
  setModelingImageContext: (context: AgentModelingImageContext | null) => void;
}

export const useAgentExecutionContextStore = create<AgentExecutionContextState>(set => ({
  colorContext: null,
  modelingImageContext: null,
  setColorContext: context => {
    set({
      colorContext: context,
    });
  },
  setModelingImageContext: context => {
    set({
      modelingImageContext: context,
    });
  },
}));
