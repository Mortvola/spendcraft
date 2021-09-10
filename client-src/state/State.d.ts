import { DateTime } from 'luxon';
import Reports from './Reports';
import User from './User';
import { CategoryType, Error, TrackingType } from '../../common/ResponseTypes'
import LoanTransaction from './LoanTransaction';

export interface GroupInterface {
  id: number;

  name: string;

  type: string;

  categories: CategoryInterface[];

  insertCategory(category: Category): void;

  async deleteCategory(categoryId: number): Promise<null | Error[]>;

  async update(name: string): Promise<null | Error[]>;
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

  paymentChannel: string | null;

  comment: string;

  getAmountForCategory(categoryId: number): number;

  async updateTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      comment?: string,
      splits: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<null>;

  async delete(): Promise<null | Error[]>;
}

export interface GroupMemberInterface {
  id: number;

  type: CategoryType;

  name: string;

  balance: number;

  transactions: TransactionInterface[];

  getTransactions(): Promise<void>;
}

export interface AccountsInterface {
  institutions: InstitutionInterface[];

  plaid: unknown | null;

  store: StoreInterface;

  async load(): Promise<void>;

  async relinkInstitution(institutionId: number): Promise<void>;

  async addInstitution(): Promise<void>;

  updateBalances(balances: AccountBalanceProps[]): void;

  async addOfflineAccount(
    institiute: string,
    account: string,
    balance: number,
    startDate: string,
    type: string,
    subtype: string,
    tracking: TrackingType,
    rate: number,
  ): Promise<Error[] | null>;

  deleteInstitution(instiution: InstitutionInterface): void;
}

export interface PendingTransactionProps {
  id: number | null;
  date: string;

  createdAt: string;

  accountTransaction: {
    name: string;

    amount: number;

    account: {
      name: string,

      institution: {
        name: string;
      }
    }
  }
}

export interface CategoryInterface {
  id: number;

  name: string;

  type: CategoryType;

  groupId: number;

  balance: number;

  transactions: Transaction[];

  pending: PendingTransaction[];

  loan: {
    balance: number;
    transactions: LoanTransaction[];
  };

  fetching: boolean;

  getTransactions(): Promise<void>;

  getLoanTransactions(): Promise<void>;

  insertTransaction(transaction: Transaction): void;

  removeTransaction(transactionId: number): void;

  async update(name: string, group: GroupInterface): Promise<null | Error[]>;
}

export interface FundingPlanInterface {
  id: number;

  name: string;

  async update(name: string): Promise<void>;
}

export type Views = 'HOME' | 'PLANS' | 'ACCOUNTS' | 'REPORTS' | 'ACCOUNT' | 'LOGOUT';

export interface UIStateInterface {
  view: Views;
  selectCategory(category: CategoryInterface | null): void;
  selectAccount(account: AccountInterface | null): void;
  setView(view: Views): void;
  selectPlan(plan: FundingPlanInterface | null): void;
  selectTransaction(transaction: TransactionInterface | null): void;
  addTransaction: boolean;

  selectedCategory: CategoryInterface | null;
  selectedPlan: FundingPlanInterface | null;
  selectedAccount: AccountInterface | null;
  selectedTransaction: TransactionInterface | null;
  showAddTransaction(show: boolean): void;
}

export interface CategoryTreeInterface {
  systemIds: SystemIds;

  unassignedCat: Category | null = null;

  fundingPoolCat: Category | null = null;

  accountTransferCat: Category | null = null;

  groups: (Category | Group)[] = [];

  updateBalances(balances: CategoryBalanceProps[]): void;
  getCategory(categoryId: number): CategoryInterface | null;
  getCategoryGroup(categoryId: number): GroupInterface | null;
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

export const isCategoryTreeBalanceInterface = (r: unknown): r is CategoryTreeBalanceInterace => (
  (r as CategoryTreeBalanceInterace).id !== undefined
  && (r as CategoryTreeBalanceInterace).name !== undefined
  && (r as CategoryTreeBalanceInterace).categories !== undefined
)

export interface TransactionCategoryInterface {
  id: number;
  type: CategoryType;
  categoryId: number;
  amount: number;
  comment?: string;

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
  type: CategoryType;
  categoryId: number;
  amount: number;
}

export interface RegisterInterface {
  removeTransaction(transactionId: number): void;
}

export interface InstitutionInterface {
  id: number;

  name: string;

  offline: boolean;

  accounts: AccountInterface[];

  unlinkedAccounts: UnlinkedAccountProps[] | null;

  async addOnlineAccounts(
    accounts: UnlinkedAccountProps[],
    startDate: string,
  ): Promise<null>;

  async addOfflineAccount(
    accountName: string,
    balance: number,
    startDate: string,
    type: string,
    subtype: string,
    tracking: TrackingType,
    rate: number,
  ): Promise<Error[] | null>;

  async getUnlinkedAccounts(): Promise<void>;

  deleteAccount(account: AccountInterface): void;

  delete(): void;
}

export interface AccountInterface {
  id: number;

  name: string;

  officialName: string | null = null;

  type: string;

  subtype: string;

  tracking: TrackingType;

  syncDate: DateTime | null;

  balance: number;

  plaidBalance: number | null;

  rate: number | null;

  transactions: Transaction[] = [];

  pending: PendingTransaction[] = [];

  fetching: boolean;

  refreshing: boolean;

  store: StoreInterface;

  async getTransactions(): Promise<void>;

  async refresh(institutionId: number): Promise<void>;

  async addTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      comment?: string,
      splits: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<Error[] | null>;

  insertTransaction(transaction: Transaction): void;

  removeTransaction(transactionId: number): void;

  delete(): void;

  updateOfflineAccount(name: string): void;
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
