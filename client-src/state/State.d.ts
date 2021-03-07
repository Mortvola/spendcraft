import Reports from './Reports';
import User from './User';

export interface AccountsInterface {
  institutions: Array<Institution>;

  selectedAccount: AccountInterface | null;

  plaid: unknown | null;

  store: StoreInterface;

  async load(): Promise<void>;
}

export type Views = 'HOME' | 'PLANS' | 'ACCOUNTS' | 'REPORTS' | 'ACCOUNT' | 'LOGOUT';

export interface UIStateInterface {
  view: Views;
  selectedCategoryId: number | null;
  setView(view: Views): void;
}

type SystemIds = {
  systemGroupId: number | null,
  unassignedId: number | null,
  fundingPoolId: number | null,
};

export interface CategoryTreeInterface {
  systemIds: SystemIds;
  updateBalances(balances: Array<CategoryProps>): void;
}

export interface TransactionCategoryInterface {
  id: number | null;

  categoryId: number;

  amount: number;
}

export interface RegisterInterface {
  updateTransactionCategories(
    transactionId: number,
    splits: Array<TransactionCategoryInterface>,
    categories: Array<CategoryProps>,
  ): void;
}

export interface AccountInterface {
  id: number;

  name: string;

  tracking: string;

  syncDate: string;

  balance: number;

  refreshing: boolean;

  store: StoreInterface;
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
