import { DateTime } from 'luxon';
import Reports from './Reports';
import { CategoryType, Error, TrackingType } from '../../common/ResponseTypes'
import LoanTransaction from './LoanTransaction';

export interface UserInterface {
  username: string | null;

  email: string | null;
}

export type TreeNodeInterface = (CategoryInterface | GroupInterface);

export interface GroupInterface {
  id: number;

  name: string;

  type: string;

  categories: CategoryInterface[];

  insertCategory(category: CategoryInterface): void;

  removeCategory(category: CategoryInterface): void;

  delete (): Promise<null | Error[]>;

  update(name: string): Promise<null | Error[]>;
}

export interface TransactionInterface {
  id: number | null;

  amount: number;

  date: DateTime;

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

export interface PendingTransactionInterface {
  id: number | null;

  amount: number;

  date: DateTime;

  name: string;

  instituteName: string;

  accountName: string;
}

export interface AccountsInterface {
  institutions: InstitutionInterface[];

  store: StoreInterface;

  async load(): Promise<void>;

  async linkInstitution(): Promise<void>;

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

export interface CategoryInterface extends TransactionContainerInterface {
  id: number;

  name: string;

  type: CategoryType;

  groupId: number;

  loan: {
    balance: number;
    transactions: LoanTransaction[];
  };

  store: StoreInterface;

  getTransactions(): Promise<void>;

  getMoreTransactions(): Promise<void>;

  getPendingTransactions(index = 0): Promise<void>;

  insertTransaction(transaction: Transaction): void;

  removeTransaction(transactionId: number): void;

  update(name: string, group: GroupInterface): Promise<null | Error[]>;

  delete (): Promise<null | Error[]>;

  updateBalances(balances: CategoryBalanceProps[]): void;

  getGroup(): GroupInterface;
}

export interface FundingPlanInterface {
  id: number;

  name: string;

  async update(name: string): Promise<void>;
}

export type Views = 'HOME' | 'PLANS' | 'ACCOUNTS' | 'REPORTS' | 'USER_ACCOUNT' | 'LOGOUT';

export interface UIStateInterface {
  selectCategory(category: CategoryInterface | null): void;
  selectAccount(account: AccountInterface | null): void;
  selectPlan(plan: FundingPlanInterface | null): void;
  selectTransaction(transaction: TransactionInterface | null): void;

  selectedCategory: CategoryInterface | null;
  selectedPlan: FundingPlanInterface | null;
  selectedAccount: AccountInterface | null;
  selectedTransaction: TransactionInterface | null;
  plaid: Plaid | null;
}

export interface CategoryTreeInterface {
  systemIds: SystemIds;

  noGroupGroup: GroupInterface | null;

  unassignedCat: CategoryInterface | null;

  fundingPoolCat: CategoryInterface | null;

  accountTransferCat: CategoryInterface | null;

  nodes: (CategoryInterface | GroupInterface)[] = [];

  insertNode(node: TreeNodeInterface): void;

  updateBalances(balances: CategoryBalanceProps[]): void;

  getCategory(categoryId: number): CategoryInterface | null;

  getCategoryGroup(categoryId: number): GroupInterface;

  removeNode(node: GroupInterface | CategoryInterface): void;
}

export interface CategoryBalanceInterface {
  id: number,
  balance:number,
}

export interface TransactionCategoryInterface {
  id?: number;
  categoryId: number;
  amount: number;
  comment?: string;
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

  relink(): Promise<void>;

  addOnlineAccounts(
    accounts: UnlinkedAccountProps[],
    startDate: string,
  ): Promise<null>;

  addOfflineAccount(
    accountName: string,
    balance: number,
    startDate: string,
    type: string,
    subtype: string,
    tracking: TrackingType,
    rate: number,
  ): Promise<Error[] | null>;

  getUnlinkedAccounts(): Promise<void>;

  deleteAccount(account: AccountInterface): void;

  removeAccount(account: AccountInterface): void;

  delete(): void;

  hasOpenAccounts(): boolean;

  hasClosedAccounts(): boolean;
}

export interface QueryManagerInterface {
  fetching: boolean;
}

export interface TransactionContainerInterface {
  balance: number;

  transactions: TransactionInterface[];

  pending: PendingTransactionInterface[];

  transactionsQuery: QueryManagerInterface;
}

export interface AccountInterface extends TransactionContainerInterface {
  id: number;

  name: string;

  officialName: string | null = null;

  closed: boolean;

  type: string;

  subtype: string;

  tracking: TrackingType;

  syncDate: DateTime | null;

  plaidBalance: number | null;

  rate: number | null;

  refreshing: boolean;

  institution: InstitutionInterface;

  store: StoreInterface;

  getTransactions(): Promise<void>;

  getMoreTransactions(): void;

  getPendingTransactions(): Promise<void>;

  refresh(institutionId: number): Promise<boolean>;

  addTransaction(
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

  setClosed(closed: boolean): void;
}

export interface BalanceInterface {
  id: number;

  date: DateTime;

  balance: number;

  update(
    values: {
      date: string,
      amount: number,
    },
  ): Promise<Error[] | null>;

  delete(): Promise<null | Error[]>;
}

export interface BalancesInterface {
  account: AccountInterface | null;

  balances: Balance[];

  store: StoreInterface;

  addBalance(
    values: {
      date: string,
      amount: number,
    },
  ): Promise<Error[] | null>;

  insertBalance(balance: Balance): void;

  removeBalance(balance: BalanceInterface);
}

export interface PlansInterface {
  list: FundingPlan[];

  details: FundingPlanDetails | null = null;
}

export interface StoreInterface {
  user: UserInterface;

  categoryTree: CategoryTreeInterface;

  register: RegisterInterface;

  accounts: AccountsInterface;

  balances: BalancesInterface;

  uiState: UIStateInterface;

  reports: Reports;

  plans: PlansInterface;
}

export type AddTransactionRequest = {
  date?: string,
  name?: string,
  amount?: number,
  splits:(TransactionCategoryInterface | NewTransactionCategoryInterface)[],
};
