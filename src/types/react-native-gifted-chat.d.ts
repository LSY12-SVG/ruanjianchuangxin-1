declare module 'react-native-gifted-chat' {
  import * as React from 'react';
  import type {TextInputProps} from 'react-native';

  export interface IUser {
    _id: string | number;
    name?: string;
    avatar?: string;
  }

  export interface IMessage {
    _id: string | number;
    text: string;
    createdAt: Date | number;
    user: IUser;
    system?: boolean;
    pending?: boolean;
  }

  export interface GiftedChatProps<TMessage extends IMessage = IMessage> {
    messages?: TMessage[];
    user?: IUser;
    text?: string;
    onSend?: (messages: TMessage[]) => void;
    placeholder?: string;
    textInputProps?: Partial<TextInputProps>;
    isSendButtonAlwaysVisible?: boolean;
    isTyping?: boolean;
    scrollToBottom?: boolean;
    renderChatFooter?: () => React.ReactNode;
    renderBubble?: (props: BubbleProps<TMessage>) => React.ReactNode;
    renderInputToolbar?: (props: InputToolbarProps<TMessage>) => React.ReactNode;
    renderSend?: (props: SendProps<TMessage>) => React.ReactNode;
  }

  export interface BubbleProps<TMessage extends IMessage = IMessage> extends Record<string, unknown> {
    currentMessage?: TMessage;
  }

  export interface InputToolbarProps<TMessage extends IMessage = IMessage>
    extends Record<string, unknown> {
    text?: string;
    user?: IUser;
    messages?: TMessage[];
  }

  export interface SendProps<TMessage extends IMessage = IMessage> {
    children?: React.ReactNode;
    containerStyle?: unknown;
    currentMessage?: TMessage;
  }

  export const GiftedChat: React.ComponentType<GiftedChatProps>;
  export const Bubble: React.ComponentType<BubbleProps>;
  export const InputToolbar: React.ComponentType<InputToolbarProps>;
  export const Send: React.ComponentType<SendProps>;
}
