// 账号相关类型定义
export interface Account {
  id: string;
  phoneNumber: string;
  session: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  addMethod?: 'phone' | 'session'; // 添加方式
  status: 'online' | 'offline' | 'restricted';
  healthScore?: number; // 健康度评分（0-100）
  lastActive: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountStatus {
  online: boolean;
  restricted: boolean;
  lastSeen?: Date;
}
