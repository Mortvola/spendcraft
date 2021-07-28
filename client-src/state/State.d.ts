import Reports from './Reports';
import User from './User';

export interface GroupInterface {
  id: number;

  name: string;

  system: boolean;
}

export interface TransactionInterface {
  id: number | null;

  amount: number;

  date: string;

  type: TransactionType;

  name: string;

  categories: TransactionCategoryInterface[];

  instituteName: string;

  accountName: string;

  transaction?: {
    date: string;

    id: number;

    sortOrder: number;

    type: number;
  }

  getAmountForCategory(categoryId: number): number;
}

export interface GroupMemberInterface {
  id: number;

  type: CategoryType;

  name: string;

  balance: number;

  transactions: TransactionInterface[];

  getTransactions(): Promise<void>;

  updateTransactionCategories(
    transactionId: number,
    categories: TransactionCategoryInterface[],
    balances: CategoryProps[],
  ): void;
}

export interface AccountsInterface {
  institutions: Array<Institution>;

  plaid: unknown | null;

  store: StoreInterface;

  async load(): Promise<void>;
}

export interface PendingTransactionProps {
  id: number | null;
  date: string;

  accountTransaction: {
    name: string;

    amount: number;
  }
}

export interface CategoryInterface {
  id: number;

  name: string;

  type: CategoryType;

  balance: number;

  groupId: number | null;

  transactions: Transaction[];

  pending: PendingTransaction[];

  fetching: boolean;

  getTransactions(): Promise<void>;

  updateTransactionCategories(
    transactionId: number,
    categories: TransactionCategoryInterface[],
    balances: CategoryProps[],
  ): void;

  removeTransaction(transactionId: number): void;
}

export type Views = 'HOME' | 'PLANS' | 'ACCOUNTS' | 'REPORTS' | 'ACCOUNT' | 'LOGOUT';

export interface UIStateInterface {
  view: Views;
  selectCategory(category: CategoryInterface | null): void;
  selectAccount(account: AccountInterface | null): void;
  selectedCategory: CategoryInterface | null;
  selectedPlanId: number | null;
  selectedAccount: AccountInterface | null;
  setView(view: Views): void;
  selectPlanId(planId: number): void;
}

export interface CategoryTreeInterface {
  systemIds: SystemIds;
  updateBalances(balances: Array<CategoryProps>): void;
  getCategory(categoryId: number): CategoryInterface | null;
}

export interface CategoryBalanceInterface {
  id: number,
  name: string,
  balance:number,
  system: boolean,
}

export interface CategoryTreeBalanceInterace {
  id: number,
  name: string,
  categories: CategoryBalanceInterface[],
}

export interface TransactionCategoryInterface {
  id: number;
  type: string;
  categoryId: number;
  amount: number;

  loanTransaction?: null | {
    principle: number;
  }
}

export interface RebalanceCategoryInterface {
  id?: number;
  categoryId: number;
  amount: number;
}

export interface NewTransactionCategoryInterface {
  type: string;
  categoryId: number;
  amount: number;
}

export interface RegisterInterface {
  removeTransaction(transactionId: number): void;
}

export interface AccountInterface {
  id: number;

  name: string;

  tracking: string;

  syncDate: string;

  balance: number;

  transactions: Transaction[] = [];

  pending: PendingTransaction[] = [];

  refreshing: boolean;

  store: StoreInterface;

  async getTransactions(): Promise<void>;
}

export interface BalancesInterface {
  account: AccountInterface | null;

  balances: Array<unknown>;

  store: StoreInterface;
}

export interface PlansInterface {
  list: Array<FundingPlan>;

  details: FundingPlanDetails | null;
}

export interface StoreInterface {
  user: User;

  categoryTree: CategoryTreeInterface;

  register: RegisterInterface;

  accounts: AccountsInterface;

  balances: BalancesInterface;

  uiState: UIStateInterface;

  reports: Reports;

  plans: PlansInterface;
}
