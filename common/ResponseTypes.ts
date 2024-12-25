export enum GroupType {
  NoGroup = 'NO GROUP',
  Regular = 'REGULAR',
  System = 'SYSTEM',
}

export interface GroupProps {
  id: number;

  name: string;

  type: GroupType;

  parentGroupId: number | null,
}

export const isGroupProps = (r: unknown): r is GroupProps => (
  (r as GroupProps)?.id !== undefined
  && (r as GroupProps)?.name !== undefined
  // && (r as GroupProps).type !== undefined
);

export enum CategoryType {
  Regular = 'REGULAR',
  Unassigned = 'UNASSIGNED',
  FundingPool = 'FUNDING POOL',
  AccountTransfer = 'ACCOUNT TRANSFER',
  Loan = 'LOAN',
  Bill = 'BILL',
  Goal = 'GOAL',
}

export interface CategoryProps {
  id: number;

  groupId: number;

  balance: number;

  name: string;

  type: CategoryType;

  fundingAmount: number;

  includeFundingTransfers: boolean;

  goalDate: string | null;

  useGoal: boolean;

  recurrence: number;

  fundingCategories: { categoryId: number, amount: number, percentage: boolean }[];
}

export const isCategoryBalance = (r: unknown): r is CategoryBalanceProps => (
  (r as CategoryBalanceProps).id !== undefined
  && (r as CategoryBalanceProps).balance !== undefined
);

export interface CategoryBalanceProps {
  id: number;

  balance: number;

  count?: number;
}

export interface AccountBalanceProps {
  id: number;

  balance: number;
}

export type AddCategoryResponse = CategoryProps

export const isAddCategoryResponse = (r: unknown): r is AddCategoryResponse => (
  (r as AddCategoryResponse).id !== undefined
  && (r as AddCategoryResponse).balance !== undefined
  && (r as AddCategoryResponse).name !== undefined
  && (r as AddCategoryResponse).type !== undefined
);

export interface UpdateCategoryResponse {
  type: CategoryType;
  name: string;
  monthlyExpenses: boolean;
  fundingAmount: number,
  includeFundingTransfers: boolean;
  goalDate: string,
  recurrence: number,
  fundingCategories: { categoryId: number, amount: number, percentage: boolean }[],
}

export const isUpdateCategoryResponse = (
  r: UpdateCategoryResponse | unknown,
): r is UpdateCategoryResponse => (
  (r as UpdateCategoryResponse).name !== undefined
);

export interface UpdateLoanResponse {
  name: string;
  balance: number;
  rate: number;
}

export const isUpdateLoanResponse = (
  r: unknown,
): r is UpdateLoanResponse => (
  (r as UpdateLoanResponse).name !== undefined
  && (r as UpdateLoanResponse).balance !== undefined
  && (r as UpdateLoanResponse).rate !== undefined
);

export interface UpdateFundingCategoryResponse {
  id: number;
  fundingAmount: number;
}

export const isUpdateFundingCategoryResponse = (
  r: UpdateFundingCategoryResponse | unknown,
): r is UpdateFundingCategoryResponse => (
  (r as UpdateFundingCategoryResponse).fundingAmount !== undefined
  && (r as UpdateFundingCategoryResponse).id !== undefined
);

export const isCategoryProps = (r: unknown): r is CategoryProps => (
  (r as CategoryProps)?.id !== undefined
  && (r as CategoryProps)?.name !== undefined
  && (r as CategoryProps)?.balance !== undefined
);

export type AccountType = 'depository' | 'credit' | 'loan' | 'investment' | 'brokerage' | 'other';

export interface AccountProps {
  id: number;

  plaidId: string | null;

  name: string;

  closed: boolean;

  type: AccountType;

  subtype: string;

  tracking: TrackingType;

  balance: number;

  plaidBalance: number | null;

  startDate: string | null;

  rate: number | null,
}

export const isAccountProps = (r: unknown): r is AccountProps => (
  (r as AccountProps).id !== undefined
  && (r as AccountProps).name !== undefined
  && (r as AccountProps).tracking !== undefined
  // && (r as AccountProps).syncDate !== undefined
  && (r as AccountProps).balance !== undefined
);

export interface AccountTrackingProps {
  id: string,
  mask: string,
  tracking: TrackingType,
}

export interface AddInstitutionProps {
  publicToken: string,
  institutionId: string,
}

export interface UpdateInstitutionProps {
  startDate: string,
  accounts: AccountTrackingProps[],
}

export interface InstitutionProps {
  id: number;

  plaidInstitutionId: string | null;

  name: string;

  offline: boolean;

  syncDate: string | null;

  accounts: AccountProps[];
}

export const isInstitutionProps = (r: unknown): r is InstitutionProps => (
  (r as InstitutionProps).id !== undefined
  && (r as InstitutionProps).name !== undefined
  && (r as InstitutionProps).accounts !== undefined
);

export const isInstitutionsResponse = (r: unknown): r is InstitutionProps[] => (
  Array.isArray(r)
  && ((r as InstitutionProps[]).length === 0
  || isInstitutionProps((r as InstitutionProps[])[0]))
);

export interface AddInstitutionResponse {
  id: number;

  plaidInstitutionId: string | null;

  name: string;

  offline: boolean;

  syncDate: string | null;

  accounts: AccountProps[];

  categories: CategoryBalanceProps[];
}

export const isAddInstitutionResponse = (r: unknown): r is AddInstitutionResponse => (
  (r as AddInstitutionResponse).id !== undefined
  && (r as AddInstitutionResponse).name !== undefined
  // && (r as AddInstitutionResponse).offline !== undefined
  && (r as AddInstitutionResponse).accounts !== undefined
  && Array.isArray((r as AddInstitutionResponse).accounts)
  // && (r as AddInstitutionResponse).categories !== undefined
  // && Array.isArray((r as AddInstitutionResponse).categories)
);

export type StatementProps = {
  id: number,
  startDate: string,
  endDate: string,
  startingBalance: number,
  endingBalance: number,
  credits: number,
  debits: number,
}

export type AddStatementResponse = StatementProps

export type StatementsResponse = StatementProps[]

export enum TransactionType {
  REGULAR_TRANSACTION = 0,
  TRANSFER_TRANSACTION = 1,
  FUNDING_TRANSACTION = 2,
  REBALANCE_TRANSACTION = 3,
  STARTING_BALANCE = 4,
  MANUAL_TRANSACTION = 5,
}

export type Location = {
  address: string | null,
  city: string | null,
  region: string | null,
  postalCode: string | null,
  country: string | null,
  lat: number | null,
  lon: number | null,
  storeNumber: string | null,
};

export interface TransactionProps {
  id: number | null;

  date: string;

  sortOrder: number;

  type: TransactionType;

  comment: string;

  version: number;

  categories: {
    categoryId: number,
    amount: number,
    comment?: string,
    funder?: boolean,
    fundingCategories?: { categoryId: number, amount: number, percentage: boolean }[],
    includeFundingTransfers?: boolean,
    baseAmount?: number,
  }[];

  duplicateOfTransactionId: number | null;

  accountTransaction: {
    name: string;

    amount: number;

    principle: number | null;

    paymentChannel: string | null,

    location: Location | null,

    statementId: number;

    accountOwner: string | null;

    pending: boolean;

    account: {
      id: number;

      name: string;

      institution: {
        name: string;
      }
    }
  },
}

export const isTransactionProps = (r: unknown): r is TransactionProps => (
  r !== undefined
);

export interface PendingTransactionProps {
  id: number | null;
  date: string;

  accountTransaction: {
    name: string;

    amount: number;

    accountOwner: string | null;

    account: {
      name: string,

      institution: {
        name: string;
      }
    }
  }
}

export type LoanTransactionProps = {
  id: number;

  principle: number;

  loanId: number;

  transactionCategory: {
    id: number;

    amount: number;

    transaction: {
      id: number;

      date: string;

      accountTransaction: {
        name: string;
      }
    }
  }
}

export type LoanTransactionsProps = {
  balance: number,
  transactions: LoanTransactionProps[],
};

export interface CategoryLoanResponse {
  balance: number;
  transactions: LoanTransactionProps[];
}

export const isCategoryLoanResponse = (r: unknown): r is CategoryLoanResponse => (
  r !== undefined && r !== null
  && (r as CategoryLoanResponse).transactions !== undefined
  && (r as CategoryLoanResponse).balance !== undefined
);

export interface LoanUpdateProps {
  name: string;

  loan: LoanTransactionsProps;
}

export const isLoanUpdateProps = (r: unknown): r is LoanUpdateProps => (
  ((r as LoanUpdateProps).name !== undefined
  && isCategoryLoanResponse((r as LoanUpdateProps).loan))
);

// export const isLoanTransactionProps = (r: unknown): r is LoanTransactionProps => (
//   (r as LoanTransactionProps).transaction !== undefined
// );

export type LoanTransactionsResponse = LoanTransactionProps[];

export const isLoanTransactionsResponse = (r: unknown): r is LoanTransactionsResponse => (
  r !== undefined && r !== null
  && Array.isArray(r)
  && ((r as LoanTransactionsResponse).length === 0 || (
    (r as LoanTransactionsResponse)[0].id !== undefined
    // && (r as LoanTransactionsResponse)[0].amount !== undefined
    && (r as LoanTransactionsResponse)[0].principle !== undefined
  ))
);

export interface TransactionsResponse {
  transactions: TransactionProps[];

  transactionsCount?: number,

  balance: number;
}

export const isPendingTransactionsResponse = (r: unknown): r is TransactionProps[] => (
  r !== undefined && r !== null
  && Array.isArray(r) && (r.length === 0 || isTransactionProps((r as TransactionProps[])[0]))
)

export interface Error {
  field: string;
  message: string;
  rule: string;
}

export interface ErrorResponse {
  errors: Error[];
}

export enum RequestErrorCode {
  INCORRECT_VERSION = 'INCORRECT_VERSION',
}

export interface ApiError {
  code: RequestErrorCode,
  status: string,
}

export interface ApiResponse<T> {
  data?: T,
  errors?: ApiError[],
}

export const isErrorResponse = (r: ErrorResponse | unknown): r is ErrorResponse => (
  (r as ErrorResponse).errors !== undefined
);

export interface CategoryUpdateResponse {
  name: string;
}

export const isCategoryUpdateResponse = (
  r: CategoryUpdateResponse | unknown,
): r is CategoryUpdateResponse => (
  (r as CategoryUpdateResponse).name !== undefined
);

export interface UpdateTransactionResponse {
  transaction: TransactionProps,

  categories: CategoryBalanceProps[];

  acctBalances: AccountBalanceProps[],

  statement?: StatementProps,
}

export interface UpdateCategoryTransferResponse {
  balances: CategoryBalanceProps[],

  transaction: {
    categories: { categoryId: number, amount: number, comment?: string }[],
  },
}

export const isUpdateCategoryTransferResponse = (
  r: UpdateCategoryTransferResponse | unknown,
): r is UpdateCategoryTransferResponse => (
  (r as UpdateCategoryTransferResponse).balances !== undefined
  && Array.isArray((r as UpdateCategoryTransferResponse).balances)
  && ((r as UpdateCategoryTransferResponse).balances.length === 0
  || isCategoryBalance((r as UpdateCategoryTransferResponse).balances[0]))
);

export interface DeleteTransactionResponse {
  categories: CategoryBalanceProps[],
  acctBalances: AccountBalanceProps[],
}

export const isDeleteTransactionResponse = (
  r: DeleteTransactionResponse | unknown,
): r is DeleteTransactionResponse => (
  (r as DeleteTransactionResponse).categories !== undefined
  && Array.isArray((r as DeleteTransactionResponse).categories)
  && ((r as DeleteTransactionResponse).categories.length === 0
  || isCategoryBalance((r as DeleteTransactionResponse).categories[0]))
);

export interface InsertCategoryTransferResponse {
  balances: CategoryBalanceProps[],

  transaction: TransactionProps,
}

export const isInsertCategoryTransferResponse = (r: unknown): r is InsertCategoryTransferResponse => (
  (r as InsertCategoryTransferResponse).balances !== undefined
  && Array.isArray((r as InsertCategoryTransferResponse).balances)
  && ((r as InsertCategoryTransferResponse).balances.length === 0
  || isCategoryBalance((r as InsertCategoryTransferResponse).balances[0]))
);

export const isGroupsResponse = (r: unknown): r is GroupProps[] => (
  Array.isArray(r)
  && ((r as GroupProps[]).length === 0 || isGroupProps((r as GroupProps[])[0]))
);

export const isAccountsResponse = (r: unknown): r is AccountProps[] => (
  Array.isArray(r)
  && ((r as AccountProps[]).length === 0 || isAccountProps((r as AccountProps[])[0]))
);

export type AddAccountsResponse = {
  accounts: AccountProps[],
  categories: CategoryBalanceProps[],
}

export const isAddAccountsResponse = (r: unknown): r is AddAccountsResponse => (
  (r as AddAccountsResponse).accounts !== undefined
  && ((r as AddAccountsResponse).accounts.length === 0 || isAccountProps((r as AddAccountsResponse).accounts[0]))
);

export interface FundingPlanCategoryProps {
  id?: number;

  categoryId: number;

  amount: number;

  useGoal: boolean;

  goalDate: string | null;

  recurrence: number;
}

export const isFundingPlanCategoryProps = (r: unknown): r is FundingPlanCategoryProps => (
  (r as FundingPlanCategoryProps).id !== undefined
  && (r as FundingPlanCategoryProps).categoryId !== undefined
  && (r as FundingPlanCategoryProps).amount !== undefined
  && (r as FundingPlanCategoryProps).useGoal !== undefined
  && (r as FundingPlanCategoryProps).goalDate !== undefined
  && (r as FundingPlanCategoryProps).recurrence !== undefined
);

export interface FundingPlan {
  id: number,
  categories: FundingPlanCategoryProps[],
}

export const isFundingPlanResponse = (r: unknown): r is FundingPlan => (
  (r as FundingPlan).id !== undefined
  && (Array.isArray((r as FundingPlan).categories))
  && ((r as FundingPlan).categories.length === 0 || isFundingPlanCategoryProps((r as FundingPlan).categories[0]))
)

export interface HistoryMonthProps {
  year: number;

  month: number;

  amount: number;
}

export interface HistoryCategoryProps {
  id: number;

  months: {
    expenses: number,
    funding: number,
  }[]
}

// export interface HistoryGroupProps {
//   id: number;

//   name: string;

//   categories: HistoryCategoryProps[];
// }

export interface UpdateCategoryProps {
  amount: number;
}

export interface FundingPlanDetailsProps {
  id: number;

  history: HistoryCategoryProps[];

  categories: FundingPlanCategoryProps[];
}

export const isFundingPlanDetailsProps = (
  r: FundingPlanDetailsProps| unknown,
): r is FundingPlanDetailsProps => (
  (r as FundingPlanDetailsProps).id !== undefined
  && (r as FundingPlanDetailsProps).history !== undefined
  && (r as FundingPlanDetailsProps).categories !== undefined
);

export interface FundingPlanProps {
  id: number;
  name: string;
}

export interface ProposedFundingCategoryProps {
  categoryId: number,
  amount: number,
  adjusted: boolean,
  adjustedReason: string | null,
  fundingCategories: {
    categoryId: number,
    amount: number,
    percentage: boolean,
  }[],
  includeFundingTransfers: boolean,
}

export const isFundingPlanProps = (r: unknown): r is FundingPlanProps => (
  (r as FundingPlanProps).id !== undefined
  && (r as FundingPlanProps).name !== undefined
);

export const isFundingPlansResponse = (
  r: unknown,
): r is FundingPlanProps[] => (
  Array.isArray(r)
  && ((r as FundingPlanProps[]).length === 0
  || isFundingPlanProps((r as FundingPlanProps[])[0]))
);

export type CategoryTransferProps = {
  id?: number,
  amount: number,
  categoryId: number,
}

export type CategoryFundingProps = {
  categoryId: number,
  amount: number,
  baseAmount: number,
  fundingCategories: { categoryId: number, amount: number, percentage: boolean}[],
  includeFundingTransfers: boolean,
  funder?: boolean,
}

export type FundingInfoProps = {
  id: number,
  name: string,
  balance: number,
  previousSum: number,
  previousFunding: number,
  previousCatTransfers: number,
}

export const isCategoryFundingProps = (r: unknown): r is CategoryFundingProps => (
  (r as CategoryFundingProps).amount !== undefined
  && (r as CategoryFundingProps).categoryId !== undefined
)

export interface AccountSyncProps {
  balance: number;

  plaidBalance: number | null;
}

export interface InstitutionSyncResponse {
  syncDate: string;
  accounts: AccountSyncProps[];
  categories: CategoryProps[];
}

export interface LinkTokenProps {
  linkToken: string;
}

export const isLinkTokenResponse = (
  r: LinkTokenProps | unknown,
): r is LinkTokenProps => (
  (r as LinkTokenProps).linkToken !== undefined
);

export interface BalanceProps {
  id: number,
  balance: number;
  date: string;
}

export const isBalanceProps = (r: unknown): r is BalanceProps => (
  (r as BalanceProps).balance !== undefined
);

export const isBalancesResponse = (r: unknown): r is BalanceProps[] => (
  (r as BalanceProps[]).length === 0
  || isBalanceProps((r as BalanceProps[])[0])
);

export type AddBalanceResponse = {
  id: number,
  balance: number,
  date: string,
  accountBalance: number,
}

export const isAddBalanceResponse = (r: unknown): r is AddBalanceResponse => (
  (r as AddBalanceResponse).balance !== undefined
)

export type UpdateBalanceResponse = {
  balance: number,
  date: string,
  accountBalance: number,
}

export const isUpdateBalanceResponse = (r: unknown): r is UpdateBalanceResponse => (
  (r as UpdateBalanceResponse).balance !== undefined
  && (r as UpdateBalanceResponse).date !== undefined
)

export interface UserProps {
  username: string;

  email: string;

  pendingEmail?: string;

  roles: string[];
}

export const isUserProps = (
  r: UserProps | unknown,
): r is UserProps => (
  (r as UserProps).username !== undefined
  && (r as UserProps).email !== undefined
);

export type TrackingType = 'None' | 'Balances' | 'Transactions' | 'Uncategorized Transactions';

export type UnlinkedAccountProps = {
  plaidAccountId: string,
  name: string,
  officialName: string | null,
  mask: string | null,
  type: string,
  subtype: string | null,
  balances: {
    current: number | null,
  },
  tracking: TrackingType,
};

// export const isUnlinkedAccounts = (r: unknown): r is UnlinkedAccountProps[] => (
//   (Array.isArray(r)
//   && (r as UnlinkedAccountProps[])[0].plaidAccountId !== undefined)
// );

export type AddTransactionProps = {
  date: string,

  name: string,

  amount: number,
};

export type AddTransactionResponse = {
  categories: CategoryBalanceProps[],
  transaction: TransactionProps,
  acctBalances: AccountBalanceProps[],
}

export const isAddTransactionResponse = (r: unknown): r is AddTransactionResponse => (
  (r as AddTransactionResponse).categories !== undefined
  && Array.isArray((r as AddTransactionResponse).categories)
)

export interface CategoryBalanceProps2 {
  id: number,
  name: string,
  balance:number,
  system: boolean,
}

export interface CategoryTreeBalanceProps {
  id: number,
  balance: number,
}

export const isCategoryTreeBalanceProps = (r: unknown): r is CategoryTreeBalanceProps => (
  (r as CategoryTreeBalanceProps).id !== undefined
  && (r as CategoryTreeBalanceProps).balance !== undefined
)

export const isCategoryTreeBalanceResponse = (r: unknown): r is CategoryTreeBalanceProps[] => (
  Array.isArray(r)
  && isCategoryTreeBalanceProps(r[0])
)

export const isDeleteInstitutionResponse = (r: unknown): r is CategoryBalanceProps[] => (
  Array.isArray(r)
  && (r.length === 0 || isCategoryBalance(r[0]))
)

export const isDeleteAccountResponse = (r: unknown): r is CategoryBalanceProps[] => (
  Array.isArray(r)
  && (r.length === 0 || isCategoryBalance(r[0]))
)

export type BudgetProgressReportResponse = [string, number, number[]][];

export enum PendingQueryFlag {
  NoPending = 0,
  OnlyPending = 1,
  WithPending = 2,
}

export type BillProps = {
  id: number,
  name: string,
  fundingAmount: number,
  balance: number,
  goalDate: string,
  recurrence: number,
  debits: number | null,
}
