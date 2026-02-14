import { create } from 'zustand';
import { Account } from '../types/account';

/**
 * 账号状态接口
 */
interface AccountState {
  // 状态
  accounts: Account[];
  selectedAccountId: string | null;
  loading: boolean;
  error: string | null;

  // 操作
  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  removeAccount: (id: string) => void;
  selectAccount: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

/**
 * 初始状态
 */
const initialState = {
  accounts: [],
  selectedAccountId: null,
  loading: false,
  error: null,
};

/**
 * 账号状态管理
 */
export const useAccountStore = create<AccountState>((set) => ({
  ...initialState,

  setAccounts: (accounts) => set({ accounts }),

  addAccount: (account) =>
    set((state) => ({
      accounts: [...state.accounts, account],
    })),

  updateAccount: (id, updates) =>
    set((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === id ? { ...account, ...updates } : account
      ),
    })),

  removeAccount: (id) =>
    set((state) => ({
      accounts: state.accounts.filter((account) => account.id !== id),
      selectedAccountId: state.selectedAccountId === id ? null : state.selectedAccountId,
    })),

  selectAccount: (id) => set({ selectedAccountId: id }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));
