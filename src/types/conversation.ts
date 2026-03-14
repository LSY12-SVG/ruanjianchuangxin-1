export type ConversationRole = 'user' | 'assistant' | 'system';
export type ConversationState = 'normal' | 'listening' | 'thinking' | 'error';

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  state: ConversationState;
  timestamp: string;
}
