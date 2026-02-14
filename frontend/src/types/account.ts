// 账号相关类型定义
export interface Account {
  id: string;
  phoneNumber: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  status: 'online' | 'offline' | 'restricted';
  lastActive: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountStatus {
  online: boolean;
  restricted: boolean;
  lastSeen?: Date;
}

export interface AddAccountRequest {
  phoneNumber: string;
}

export interface VerifyCodeRequest {
  accountId: string;
  code: string;
}

export interface VerifyPasswordRequest {
  accountId: string;
  password: string;
}
