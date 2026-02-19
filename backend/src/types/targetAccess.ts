import { TargetAccessErrorCode } from './task';

export interface TargetOperationResult {
  success: boolean;
  code?: TargetAccessErrorCode;
  message?: string;
}

export interface TargetResolutionResult extends TargetOperationResult {
  telegramId: string;
  normalizedPeerId?: string;
  peerType?: 'channel' | 'group' | 'user' | 'unknown';
}

export interface TargetPermissionResult extends TargetOperationResult {
  canWrite: boolean;
}

export interface TargetMembershipResult extends TargetOperationResult {
  isMember: boolean;
}
