import Reports from './Reports';
import UIState from './UIState';
import User from './User';

export interface AccountsInterface {
  institutions: Array<Institution>;

  selectedAccount: AccountInterface | null;

  plaid: unknown | null;

  store: StoreInterface;

  async load(): Promise<void>;
}

export interface CategoryTreeInterface {
  updateBalances(balances: Array<CategoryProps>): void;
}

export interface TransactionCategoryInterface {
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

  uiState: UIState;

  reports: Reports;

  plans: PlansInterface;
}
