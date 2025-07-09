import { DateTime } from 'luxon';
import { PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import Reports from './Reports';
import {
  CategoryType, Error, TrackingType, AccountType, Location,
  UnlinkedAccountProps,
  TransactionType,
  ApiError,
  AccountBalanceProps,
  CategoryBalanceProps,
  AccountProps,
  CategoryTransferProps,
  BillProps,
  StatementProps,
  GroupType,
} from '../../common/ResponseTypes'
import LoanTransaction from './LoanTransaction';
import SystemIds from './SystemIds';
import type Statement from './Statement';

export interface UserInterface {
  username: string | null;

  email: string | null;
}

export type TreeNodeInterface = (CategoryInterface | GroupInterface);

export interface GroupInterface {
  id: number;

  name: string;

  type: GroupType;

  children: (GroupInterface | CategoryInterface)[];

  group: GroupInterface | null;

  getFundingPool(): CategoryInterface;

  addCategory(params: CategoryParams): Promise<null| Error[]>;

  insertChild(child: TreeNodeInterface): void;

  removeChild(child: TreeNodeInterface): void;

  delete (): Promise<null | Error[]>;

  update(value: { name: string, parentGroupId: number | null }): Promise<null | Error[]>;

  forEachCatgory(callback: (category: CategoryInterface) => void): void;
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

  statementId: number | null;

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

  updateTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      principle?: number,
      comment?: string,
      statementId?: number | null,
      categories: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<null | ApiError[]>;

  delete(): Promise<null | Error[]>;

  updateCategoryTransfer(
    values: {
      categories: CategoryTransferProps[];
      date: string;
    },
  ): Promise<null>

  toggleReconciled(statementId: number): void;
}

export interface BaseTransactionInterface {
  id: number | null;

  amount: number;

  date: DateTime;

  type: TransactionType;

  name: string;

  instituteName: string;

  accountName: string;

  statementId: number | null;

  accountOwner: string | null;

  duplicateOfTransactionId: number | null;

  pending: boolean;

  toggleReconciled(statementId: number): void;
}

export interface AccountsInterface {
  initialized: boolean;

  institutions: InstitutionInterface[];

  store: StoreInterface;

  load(): Promise<void>;

  findAccount(id: number): AccountInterface | null;

  linkInstitution(): Promise<void>;

  updateBalances(balances: AccountBalanceProps[]): void;

  addOfflineAccount(
    institiute: string,
    account: string,
    balance: number,
    startDate: string,
    type: string,
    subtype: string,
    tracking: TrackingType,
    rate: number,
  ): Promise<Error[] | null>;

  addInstitution(
    publicToken: string,
    metadata: PlaidLinkOnSuccessMetadata,
  ): Promise<InstitutionInterface | null>;

  deleteInstitution(instiution: InstitutionInterface): void;

  closeAccount(): void;
}

export interface CategoryInterface {
  id: number;

  name: string;

  type: CategoryType;

  group: GroupInterface | null;

  subcategories: CategoryInterface[];

  balance: number;

  suspended: boolean;

  fundingAmount: number;

  includeFundingTransfers: boolean;

  useGoal: boolean;

  goalDate: DateTime | null;

  recurrence: number;

  fundingCategories: { id: number, categoryId: number, amount: number, percentage: boolean }[];

  transactions: TransactionContainerInterface;

  pendingTransactions: TransactionContainerInterface;

  loan: {
    balance: number;
    transactions: LoanTransaction[];
  };

  store: StoreInterface;

  getTotalBalance(): number;

  getFundingPool(): CategoryInterface;

  update(params: CategoryParams): Promise<null | Error[]>;

  delete (): Promise<null | Error[]>;

  updateBalances(balances: CategoryBalanceProps[]): void;

  updateBalance(balance: CategoryBalanceProps): void;

  getGroup(): GroupInterface;
}

export interface RebalancesInterface {
  transactions: TransactionContainerInterface;
}

export interface FundingPlanInterface {
  id: number;

  name: string;

  update(name: string): Promise<void>;
}

export interface PlaidInterface {
  institution: InstitutionInterface | null;

  linkToken: string;
}

export type Views = 'HOME' | 'PLANS' | 'ACCOUNTS' | 'REPORTS' | 'SEARCH' | 'USER_ACCOUNT' | 'LOGOUT';

export interface UIStateInterface {
  selectCategory(category: CategoryInterface | null): void;
  selectAccount(account: AccountInterface | null): void;
  selectStatement(statement: Statement | null): void;
  selectPlan(plan: FundingPlanInterface | null): void;
  selectTransaction(transaction: TransactionInterface | null): void;

  selectedCategory: CategoryInterface | null;
  selectedPlan: FundingPlanInterface | null;
  selectedAccount: AccountInterface | null;
  selectedStatement: Statement | null;
  selectedTransaction: TransactionInterface | null;
  plaid: PlaidInterface | null;
}

export interface BudgetInterface extends GroupInterface {
  fundingPoolCat: CategoryInterface | null;
}

export interface CategoryTreeInterface extends RemoteDataInterface {
  budget: BudgetInterface;

  systemIds: SystemIds;

  unassignedCat: CategoryInterface | null;

  accountTransferCat: CategoryInterface | null;

  rebalances: RebalancesInterface | null;

  insertNode(node: TreeNodeInterface, parentGroupId: number | null): void;

  updateBalances(balances: CategoryBalanceProps[]): void;

  getCategory(categoryId: number): CategoryInterface | null;

  getCategoryGroup(categoryId: number): GroupInterface;
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
  funder?: boolean;
  fundingCategories?: { categoryId: number, amount: number, percentage: boolean }[],
  includeFundingTransfers?: boolean,
  baseAmount?: number;
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

  sync(institutionId: number): Promise<boolean>;

  update(): Promise<InstitutionInterface | null>;

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

export type QueryManagerState = 'IDLE' | 'LOADING' | 'LOADING-MORE';

export interface QueryManagerInterface {
  state: QueryManagerState;
}

export interface TransactionContainerInterface extends RemoteDataInterface {
  transactions: TransactionInterface[];

  transactionsQuery: QueryManagerInterface;

  insertTransaction(transaction: TransactionInterface): void;

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

  officialName: string | null;

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

  statements: Statement[]

  store: StoreInterface;

  update(props: AccountProps): void;

  addTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      principle?: number,
      comment?: string,
      categories: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<Error[] | null>;

  addStatement(
    startDate: string,
    endDate: string,
    startingBalance: number,
    endingBalance: number,
  ): Promise<ApiError[] | null>;

  getStatements(): Promise<void>;

  updateStatement(props: StatementProps): void;

  delete(): void;

  updateOfflineAccount(name: string): Promise<void>;

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

  balances: BalanceInterface[];

  store: StoreInterface;

  addBalance(
    values: {
      date: string,
      amount: number,
    },
  ): Promise<Error[] | null>;

  insertBalance(balance: BalanceInterface): void;

  removeBalance(balance: BalanceInterface): void;
}

export interface FundingPlanDetailsInterface {
  id: number;
}

export interface PlansInterface {
  list: FundingPlanInterface[];

  details: FundingPlanDetailsInterface | null;
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
  categories:(TransactionCategoryInterface | NewTransactionCategoryInterface)[],
};

export type AddStatementRequest = {
  startDate: string,
  endDate: string,
  startingBalance: number,
  endingBalance: number,
}

export type CategoryParams = {
  type: CategoryType,
  name: string,
  suspended?: boolean,
  fundingAmount?: number,
  includeFundingTransfers?: boolean,
  goalDate?: DateTime,
  recurrence?: number,
  categoryId?: number,
  group: GroupInterface,
  useGoal: boolean,
  fundingCategories: unknown,
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

  delete(): Promise<void>;
}

export type TransactionLogProps = {
  id: number;
  createdAt: string;
  message: string;
  transactionId: number;
}

export type TransactionLogsResponse = TransactionLogProps[]

export interface TransactionLogInterface {
  id: number;

  message: string;

  transactionId: number;

  date: DateTime,
}

export type PlaidLogProps = {
  id: number,
  createdAt: string;
  request: string;
  response: unknown;
  status: number;
  institutionId: string;
}

export type PlaidLogsResponse = PlaidLogProps[]

export interface PlaidLogInterface {
  id: number;

  createdAt: DateTime,

  request: string;

  response: unknown;

  status: number;

  institutionId?: string;
}

export type BillsResponse = BillProps[]

export interface BillInterface {
  id: number;

  name: string;

  amount: number;

  date: DateTime | null;

  debits: number | null,
}
