import { DateTime } from 'luxon';
import Reports from './Reports';
import {
  CategoryType, Error, TrackingType, AccountType, Location,
} from '../../common/ResponseTypes'
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

export interface TransactionInterface extends BaseTransactionInterface {
  id: number | null;

  amount: number;

  principle: number | null,

  date: DateTime;

  type: TransactionType;

  name: string;

  categories: TransactionCategoryInterface[];

  instituteName: string;

  accountName: string;

  reconciled: boolean;

  accountOwner: string | null;

  transaction?: {
    date: string;

    id: number;

    sortOrder: number;

    type: number;
  }

  paymentChannel: string | null;

  location: Location | null;

  comment: string;

  duplicateOfTransactionId: number | null;

  getAmountForCategory(categoryId: number): number;

  async updateTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      principle?: number,
      comment?: string,
      splits: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<null | ApiError[]>;

  async delete(): Promise<null | Error[]>;

  toggleReconciled(): void;
}

export interface BaseTransactionInterface {
  id: number | null;

  amount: number;

  date: DateTime;

  type: TransactionType;

  name: string;

  instituteName: string;

  accountName: string;

  reconciled: boolean;

  accountOwner: string | null;

  duplicateOfTransactionId: number | null;

  pending: boolean;

  toggleReconciled(): void;
}

export interface AccountsInterface {
  initialized: boolean;

  institutions: InstitutionInterface[];

  store: StoreInterface;

  async load(): Promise<void>;

  findAccount(id: number): AccountInterface | null;

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

  async addInstitution(
    publicToken: string,
    metadata: PlaidLinkOnSuccessMetadata,
  ): Promise<Institution | null>;

  deleteInstitution(instiution: InstitutionInterface): void;

  closeAccount();
}

export interface CategoryInterface {
  id: number;

  name: string;

  type: CategoryType;

  groupId: number;

  monthlyExpenses: boolean;

  balance: number;

  fundingAmount: number;

  useGoal: boolean;

  goalDate: DateTime | null;

  recurrence: number;

  transactions: TransactionContainerInterface;

  pendingTransactions: TransactionContainerInterface;

  loan: {
    balance: number;
    transactions: LoanTransaction[];
  };

  store: StoreInterface;

  update(params: CategoryParams): Promise<null | Error[]>;

  delete (): Promise<null | Error[]>;

  updateBalances(balances: CategoryBalanceProps[]): void;

  getGroup(): GroupInterface;
}

export interface RebalancesInterface {
  transactions: TransactionContainerInterface;
}

export interface FundingPlanInterface {
  id: number;

  name: string;

  async update(name: string): Promise<void>;
}

export type Views = 'HOME' | 'PLANS' | 'ACCOUNTS' | 'REPORTS' | 'SEARCH' | 'USER_ACCOUNT' | 'LOGOUT';

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

export interface CategoryTreeInterface extends RemoteDataInterface {
  systemIds: SystemIds;

  noGroupGroup: GroupInterface | null;

  unassignedCat: CategoryInterface | null;

  fundingPoolCat: CategoryInterface | null;

  accountTransferCat: CategoryInterface | null;

  rebalances: RebalancesInterface | null;

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

  refreshing: boolean;

  syncDate: DateTime | null;

  relink(): Promise<void>;

  refresh(institutionId: number): Promise<boolean>;

  async update(): Promise<InstitutionInterface | null>;

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

  // getUnlinkedAccounts(): Promise<void>;

  deleteAccount(account: AccountInterface): void;

  closeAccount(account: AccountInterface): void;

  delete(): void;

  hasOpenAccounts(): boolean;

  hasClosedAccounts(): boolean;
}

export interface RemoteDataInterface {
  getData(index: number): Promise<void>;

  getMoreData(): Promise<void>;

  isComplete(): boolean;

  state(): 'IDLE' | 'LOADING' | 'LOADING-MORE';
}

export interface TransactionContainerInterface extends RemoteDataInterface {
  transactions: TransactionInterface[];

  transactionsQuery: QueryManagerInterface;

  insertTransaction(transaction: Transaction): void;

  removeTransaction(transactionId: number): void;
}

export interface AccountSettings {
  closed?: boolean,

  startDate?: DateTime,

  tracking?: TrackingType,
}

export interface AccountInterface {
  id: number;

  plaidId: string | null;

  name: string;

  officialName: string | null = null;

  closed: boolean;

  type: AccountType;

  subtype: string;

  tracking: TrackingType;

  plaidBalance: number | null;

  startDate: DateTime | null,

  rate: number | null;

  institution: InstitutionInterface;

  balance: number;

  transactions: TransactionContainerInterface;

  pendingTransactions: TransactionContainerInterface;

  store: StoreInterface;

  update(props: AccountProps);

  addTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      principle?: number,
      comment?: string,
      splits: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<Error[] | null>;

  delete(): void;

  updateOfflineAccount(name: string): void;

  setSettings(settings: AccountSettings): void;
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

export interface AutoAssignmentsInterface {
  remove(id: number): void;
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

  autoAssignments: AutoAssignmentsInterface;
}

export type AddTransactionRequest = {
  date?: string,
  name?: string,
  amount?: number,
  splits:(TransactionCategoryInterface | NewTransactionCategoryInterface)[],
};

export type CategoryParams = {
  type?: string,
  name: string,
  fundingAmount?: number,
  goalDate?: DateTime,
  recurrence?: number,
  categoryId?: number,
  group: GroupInterface,
  useGoal: boolean,
}

export type AutoAssignmentProps = {
  id: number;
  name: string;
  searchStrings: string[],
  categories: { id: number, categoryId: number, amount: number, percentage: boolean }[],
}

export type AutoAssignmentsResponse = AutoAssignmentProps[]

export interface AutoAssignmentInterface {
  id: number;

  name: string;

  searchStrings: string[],

  categories: { id: number, categoryId: number, amount: number, percentage: boolean }[],

  update(props: {
    name: string,
    searchStrings: string[],
    categories: { id: number, categoryId: number, amount: number, percentage: boolean }[],
  }): Promise<void>;

  async delete(): Promise<void>;
}

export type TransactionLogProps = {
  id: number;
  createdAt: string;
  message: string;
  transactionId: number;
}

export type TransactionLogsResponse = TransactionLogsProps[]

export interface TransactionLogInterface {
  id: number;

  message: string;

  transactionId: number;
}
