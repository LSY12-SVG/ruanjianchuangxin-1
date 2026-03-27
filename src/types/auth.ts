import type {AuthUser} from '../profile/api';

export type AuthBootstrapStatus =
  | 'bootstrapping'
  | 'unauthenticated'
  | 'submitting'
  | 'authenticated';

export type AuthFormMode = 'login' | 'register';

export interface AuthSessionState {
  status: AuthBootstrapStatus;
  mode: AuthFormMode;
  user: AuthUser | null;
  errorMessage: string;
}
