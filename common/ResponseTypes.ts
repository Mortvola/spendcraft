/** Canonical two-decimal monetary string, e.g. "12.50". */
export type DecimalMoneyString = string;

export enum GroupType {
  NoGroup = 'NO GROUP',
  Regular = 'REGULAR',
  System = 'SYSTEM',
  Bills = 'BILLS',
}

export interface GroupProps {
  id: number;

  name: string;

  type: GroupType;

  parentGroupId: number | null,
}

export enum CategoryType {
  Regular = 'REGULAR',
  Unassigned = 'UNASSIGNED',
  FundingPool = 'FUNDING POOL',
  AccountTransfer = 'ACCOUNT TRANSFER',
  Loan = 'LOAN',
  Bill = 'BILL',
  Goal = 'GOAL',
}

/** Fixed-dollar amounts are money strings; percentage-mode amounts remain numbers. */
export type FundingRuleResponse = { categoryId: number } & (
  { percentage: false; amount: DecimalMoneyString }
  | { percentage: true; amount: number }
);

export interface AutoAssignmentWriteRequest {
  name: string;
  searchStrings: string[];
  categories: ({ id: number } & FundingRuleResponse)[];
}

export interface CategoryWriteRequest {
  name: string;
  type?: CategoryType;
  groupId?: number;
  fundingAmount?: DecimalMoneyString;
  fundingCategories?: FundingRuleResponse[];
  goalDate?: string | null;
  useGoal?: boolean;
  includeFundingTransfers?: boolean;
  recurrence?: number;
  suspended?: boolean;
  hidden?: boolean;
}

export type CategoryCreateRequest = CategoryWriteRequest & {
  useGoal: boolean;
  fundingCategories: FundingRuleResponse[];
};

export interface CategoryProps {
  id: number;

  groupId: number;

  balance: DecimalMoneyString;

  name: string;

  type: CategoryType;

  fundingAmount: DecimalMoneyString;

  includeFundingTransfers: boolean;

  goalDate: string | null;

  useGoal: boolean;

  recurrence: number;

  suspended: boolean;

  fundingCategories: FundingRuleResponse[];

  hidden: boolean;
}

const isCategoryBalance = (r: unknown): r is CategoryBalanceProps => (
  (r as CategoryBalanceProps).id !== undefined
  && (r as CategoryBalanceProps).balance !== undefined
);

export interface CategoryBalanceProps {
  id: number;

  balance: DecimalMoneyString;

  count?: number;
}

export interface AccountBalanceProps {
  id: number;

  balance: DecimalMoneyString;
}

type AddCategoryResponse = CategoryProps

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
  suspended: boolean;
  fundingAmount: DecimalMoneyString,
  includeFundingTransfers: boolean;
  goalDate: string,
  recurrence: number,
  fundingCategories: FundingRuleResponse[],
  hidden: boolean,
}

export const isCategoryProps = (r: unknown): r is CategoryProps => (
  (r as CategoryProps)?.id !== undefined
  && (r as CategoryProps)?.name !== undefined
  && (r as CategoryProps)?.balance !== undefined
);

export enum AccountType {
  Depository = 'depository',
  Credit = 'credit',
  Loan = 'loan',
  Investment = 'investment',
  Other = 'other',
}

export interface AccountProps {
  id: number;

  plaidId: string | null;

  name: string;

  closed: boolean;

  type: AccountType;

  subtype: string;

  tracking: TrackingType;

  balance: DecimalMoneyString;

  pendingBalance: DecimalMoneyString;

  plaidBalance: DecimalMoneyString | null;

  startDate: string | null;

  rate: number | null,
}

const isAccountProps = (r: unknown): r is AccountProps => (
  (r as AccountProps).id !== undefined
  && (r as AccountProps).name !== undefined
  && (r as AccountProps).tracking !== undefined
  // && (r as AccountProps).syncDate !== undefined
  && (r as AccountProps).balance !== undefined
);

// export interface AccountTrackingProps {
//   id: string,
//   mask: string,
//   tracking: TrackingType,
// }

export interface AddInstitutionProps {
  publicToken: string,
  institutionId: string,
}

export interface InstitutionProps {
  id: number;

  plaidInstitutionId: string | null;

  name: string;

  syncDate: string | null;

  accounts: AccountProps[];
}

const isInstitutionProps = (r: unknown): r is InstitutionProps => (
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

  syncDate: string | null;

  accounts: AccountProps[];

  categories: CategoryBalanceProps[];
}

// Statement wire amounts use canonical two-decimal strings in both directions.
export interface StatementProps {
  id: number,
  startDate: string,
  endDate: string,
  startingBalance: DecimalMoneyString,
  endingBalance: DecimalMoneyString,
  credits: DecimalMoneyString,
  debits: DecimalMoneyString,
  data?: Partial<{
    shortTermCapitalGains: DecimalMoneyString | null,
    longTermCapitalGains: DecimalMoneyString | null,
    dividends: DecimalMoneyString | null,
    taxableInterest: DecimalMoneyString | null,
  }> | null
}

export interface AddStatementRequest {
  startDate: string,
  endDate: string,
  startingBalance: DecimalMoneyString,
  endingBalance: DecimalMoneyString,
  data?: {
    shortTermCapitalGains: DecimalMoneyString,
    longTermCapitalGains: DecimalMoneyString,
    dividends: DecimalMoneyString,
    taxableInterest: DecimalMoneyString,
  }
}

export type UpdateStatementProps = Partial<{
  id: number,
  startDate: string,
  endDate: string,
  startingBalance: DecimalMoneyString,
  endingBalance: DecimalMoneyString,
  credits: DecimalMoneyString,
  debits: DecimalMoneyString,
  data: {
    shortTermCapitalGains: DecimalMoneyString,
    longTermCapitalGains: DecimalMoneyString,
    dividends: DecimalMoneyString,
    taxableInterest: DecimalMoneyString,
  },
  reconcile: 'All' | 'None'
}>


export interface AddStatementResponse extends StatementProps {
  transactions: number[],
}

export type StatementsResponse = StatementProps[]

export enum TransactionType {
  REGULAR_TRANSACTION = 0,
  TRANSFER_TRANSACTION = 1,
  FUNDING_TRANSACTION = 2,
  REBALANCE_TRANSACTION = 3,
  STARTING_BALANCE = 4,
  MANUAL_TRANSACTION = 5,
}

export interface Location {
  address: string | null,
  city: string | null,
  region: string | null,
  postalCode: string | null,
  country: string | null,
  lat: number | null,
  lon: number | null,
  storeNumber: string | null,
}

export interface TransactionProps {
  id: number | null;

  date: string;

  sortOrder: number;

  type: TransactionType;

  comment: string;

  version: number;

  categories: {
    categoryId: number,
    amount: DecimalMoneyString,
    comment?: string,
    funder?: boolean,
    fundingCategories?: FundingRuleResponse[],
    includeFundingTransfers?: boolean,
    baseAmount?: DecimalMoneyString,
  }[];

  taxes: {
    type: string,
    amount: DecimalMoneyString,
  }[];

  duplicateOfTransactionId: number | null;

  accountTransaction: {
    name: string;

    amount: DecimalMoneyString;

    principle: DecimalMoneyString | null;

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

export interface LoanTransactionProps {
  id: number;

  principle: DecimalMoneyString;

  loanId: number;

  transactionCategory: {
    id: number;

    amount: DecimalMoneyString;

    transaction: {
      id: number;

      date: string;

      accountTransaction: {
        name: string;
      }
    }
  }
}

export interface LoanTransactionsProps {
  balance: DecimalMoneyString,
  transactions: LoanTransactionProps[],
}

export interface LoanUpdateProps {
  name: string;

  loan: LoanTransactionsProps;
}

// export const isLoanTransactionProps = (r: unknown): r is LoanTransactionProps => (
//   (r as LoanTransactionProps).transaction !== undefined
// );

export interface TransactionLogChanges extends Record<string, unknown> {
  amount?: {
    old?: DecimalMoneyString | null;
    new?: DecimalMoneyString | null;
    [key: string]: unknown;
  } | null;
}

export interface TransactionsResponse {
  transactions: TransactionProps[];

  transactionsCount?: number,

  balance: DecimalMoneyString;
}

export interface ErrorProps {
  field: string;
  message: string;
  rule: string;
}

export const isErrorPropsArray = (r: unknown): r is ErrorProps[] => (
  Array.isArray(r)
  && (r[0] as ErrorProps).field !== undefined
  && (r[0] as ErrorProps).message !== undefined
  && (r[0] as ErrorProps).rule !== undefined
)

interface ErrorResponse {
  errors: ErrorProps[];
}

export enum RequestErrorCode {
  INCORRECT_VERSION = 'INCORRECT_VERSION',
  HAS_CHILDREN = 'HAS_CHILDREN',
}

export interface ApiError {
  code: RequestErrorCode,
  status: string,
  detail: string,
  source?: {
    pointer: string,
  },
}

export interface ApiResponse<T> {
  data?: T,
  errors?: ApiError[],
}

export const isApiErrorArray = (r: unknown): r is ApiError[] => (
  Array.isArray(r)
  && (r[0] as ApiError).code !== undefined
  && (r[0] as ApiError).detail !== undefined
  && (r[0] as ApiError).source !== undefined
)

export const isErrorResponse = (r:  | unknown): r is ErrorResponse => (
  (r as ErrorResponse).errors !== undefined
);

export interface UpdateTransactionResponse {
  transaction: TransactionProps,

  categories: CategoryBalanceProps[];

  acctBalances: AccountBalanceProps[],

  statement?: StatementProps,
}

interface UpdateCategoryTransferResponse {
  balances: CategoryBalanceProps[],

  transaction: TransactionProps,
}

export const isUpdateCategoryTransferResponse = (
  r: UpdateCategoryTransferResponse | unknown,
): r is UpdateCategoryTransferResponse => (
  (r as UpdateCategoryTransferResponse).balances !== undefined
  && Array.isArray((r as UpdateCategoryTransferResponse).balances)
  && ((r as UpdateCategoryTransferResponse).balances.length === 0
  || isCategoryBalance((r as UpdateCategoryTransferResponse).balances[0]))
);

interface DeleteTransactionResponse {
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

interface InsertCategoryTransferResponse {
  balances: CategoryBalanceProps[],

  transaction: TransactionProps,
}

export const isInsertCategoryTransferResponse = (r: unknown): r is InsertCategoryTransferResponse => (
  (r as InsertCategoryTransferResponse).balances !== undefined
  && Array.isArray((r as InsertCategoryTransferResponse).balances)
  && ((r as InsertCategoryTransferResponse).balances.length === 0
  || isCategoryBalance((r as InsertCategoryTransferResponse).balances[0]))
);

export interface AddOnlineAccountsResponse {
  accounts: AccountProps[],
  categories: CategoryBalanceProps[],
}

export const isAddOnlineAccountsResponse = (r: unknown): r is AddOnlineAccountsResponse => (
  (r as AddOnlineAccountsResponse).accounts !== undefined
  && ((r as AddOnlineAccountsResponse).accounts.length === 0 || isAccountProps((r as AddOnlineAccountsResponse).accounts[0]))
);

export interface AddOfflineAccountResponse {
  account: AccountProps,
  categories: CategoryBalanceProps[],
}

export interface ProposedFundingCategoryProps {
  categoryId: number,
  amount: DecimalMoneyString,
  adjusted: boolean,
  adjustedReason: string | null,
  fundingCategories: FundingRuleResponse[],
  includeFundingTransfers: boolean,
}

export interface CategoryTransferProps {
  id?: number,
  amount: number,
  categoryId: number,
  baseAmount?: number,
  comment?: string,
  funder?: boolean,
  fundingCategories?: { categoryId: number, amount: number, percentage: boolean }[],
  includeFundingTransfers?: boolean,
}

export interface CategoryTransferRequest {
  date: string;
  type: TransactionType;
  categories: (Omit<CategoryTransferProps, 'amount' | 'baseAmount' | 'fundingCategories'> & {
    amount: DecimalMoneyString;
    baseAmount?: DecimalMoneyString;
    fundingCategories?: FundingRuleResponse[];
  })[];
}

export interface CategoryFundingProps {
  categoryId: number,
  amount: number,
  baseAmount: number,
  fundingCategories: { categoryId: number, amount: number, percentage: boolean}[],
  includeFundingTransfers: boolean,
  funder?: boolean,
}

export interface FundingInfoProps {
  id: number,
  name: string,
  balance: DecimalMoneyString,
  previousSum: DecimalMoneyString,
  previousFunding: DecimalMoneyString,
  previousBaseAmount: DecimalMoneyString,
  previousCatTransfers: DecimalMoneyString,
}

interface AccountSyncProps {
  balance: DecimalMoneyString;

  plaidBalance: DecimalMoneyString | null;
}

export interface InstitutionSyncResponse {
  syncDate: string;
  accounts: AccountSyncProps[];
  categories: CategoryProps[];
}

interface LinkTokenProps {
  linkToken: string;
}

export const isLinkTokenResponse = (
  r: LinkTokenProps | unknown,
): r is LinkTokenProps => (
  (r as LinkTokenProps).linkToken !== undefined
);

// Read-only points from the existing Transaction-derived account chart endpoint.
export interface AccountBalancePoint {
  balance: DecimalMoneyString;
  date: string;
}

export const isAccountBalanceSeries = (value: unknown): value is AccountBalancePoint[] => (
  Array.isArray(value) && value.every((point: unknown) =>
    typeof point === 'object' && point !== null
    && 'date' in point && typeof point.date === 'string'
    && 'balance' in point && typeof point.balance === 'string')
);

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

export enum TrackingType {
  None = 'None',
  Balances = 'Balances',
  Transactions = 'Transactions',
  UncategorizedTransactions = 'Uncategorized Transactions',
}

export interface UnlinkedAccountProps {
  plaidAccountId: string,
  name: string,
  officialName: string | null,
  mask: string | null,
  type: string,
  subtype: string | null,
  balances: {
    current: DecimalMoneyString | null,
  },
  tracking: TrackingType,
}

// export const isUnlinkedAccounts = (r: unknown): r is UnlinkedAccountProps[] => (
//   (Array.isArray(r)
//   && (r as UnlinkedAccountProps[])[0].plaidAccountId !== undefined)
// );

// interface AddTransactionProps {
//   date: string,

//   name: string,

//   amount: number,
// }

export interface AddTransactionResponse {
  categories: CategoryBalanceProps[],
  transaction: TransactionProps,
  acctBalances: AccountBalanceProps[],
}

export const isAddTransactionResponse = (r: unknown): r is AddTransactionResponse => (
  (r as AddTransactionResponse).categories !== undefined
  && Array.isArray((r as AddTransactionResponse).categories)
)

// export interface CategoryBalanceProps2 {
//   id: number,
//   name: string,
//   balance:number,
//   system: boolean,
// }

interface CategoryTreeBalanceProps {
  id: number,
  balance: DecimalMoneyString,
}

const isCategoryTreeBalanceProps = (r: unknown): r is CategoryTreeBalanceProps => (
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

/** Header row and dates are text; subsequent numeric columns are monetary strings. */
export type NetworthReportResponse = string[][];

export interface PayeeReportRow {
  rowNumber: string;
  name: string;
  paymentChannel: string;
  sum: DecimalMoneyString;
  count: number;
}

export interface CategoryReportRow {
  rowNumber: string;
  groupName: string;
  categoryName: string;
  sum: DecimalMoneyString;
  count: number;
}

export type IncomeVsExpensesReportResponse = [string, DecimalMoneyString, DecimalMoneyString, DecimalMoneyString][];

export interface FundingHistoryReportRow {
  groupId: number;
  groupName: string;
  groupType: GroupType;
  categoryId: number;
  categoryName: string;
  history: { year: number, month: number, amount: DecimalMoneyString }[] | null;
}

export type FundingHistoryReportResponse = FundingHistoryReportRow[];
export type BudgetProgressReportResponse = [string, DecimalMoneyString, number[]][];

// export enum PendingQueryFlag {
//   NoPending = 0,
//   OnlyPending = 1,
//   WithPending = 2,
// }

export interface BillProps {
  id: number,
  debits: DecimalMoneyString | null,
}

export enum FilingStatus {
  Single = 'Single',
  MarriedFilingSeparate = 'MarriedFilingSeparate',
  MarriedFilingJointly = 'MarriedFilingJointly',
  HeadOfHousehold = 'HeadOfHousehold',
  QualifyingSurvivingSpouse = 'QualifyingSurvivingSpouse',
}

export interface TaxActualProps {
  month: number,
  taxableInterest: DecimalMoneyString,
  ordinaryDividends: DecimalMoneyString,
  shortTermCapitalGains: DecimalMoneyString,
  longTermCapitalGains: DecimalMoneyString,
  taxes: {
    taxable_social_security_benefits?: DecimalMoneyString,
    estimated_tax_payments?: DecimalMoneyString,
  },
}

interface Worksheet2_1_Props {
  expectedAgi: DecimalMoneyString,
  priorYearAgi: DecimalMoneyString,
  priorYearTotalTax: DecimalMoneyString,
}

export interface TaxProps {
  year: number,
  forecast?: {
    filingStatus: FilingStatus,
    taxableInterest: DecimalMoneyString,
    qualifiedDividends: DecimalMoneyString,
    ordinaryDividends: DecimalMoneyString,
    taxableIraDistributions: DecimalMoneyString,
    taxablePensionAndAnnuities: DecimalMoneyString,
    taxableSocialSecurityBenefits: DecimalMoneyString,
    additionalTaxableIncome: DecimalMoneyString,
    shortTermCapitalGains: DecimalMoneyString,
    longTermCapitalGains: DecimalMoneyString,
    qualifiedBusinessIncomeDeduction: DecimalMoneyString,
    estimated?: Worksheet2_1_Props
  },
  actuals?: TaxActualProps[],
}

export interface TaxUpdateProps {
  year: number,
  forecast: {
    filingStatus: FilingStatus,
    taxableInterest: DecimalMoneyString,
    qualifiedDividends: DecimalMoneyString,
    ordinaryDividends: DecimalMoneyString,
    taxableIraDistributions: DecimalMoneyString,
    taxablePensionAndAnnuities: DecimalMoneyString,
    taxableSocialSecurityBenefits: DecimalMoneyString,
    additionalTaxableIncome: DecimalMoneyString,
    shortTermCapitalGains: DecimalMoneyString,
    longTermCapitalGains: DecimalMoneyString,
    qualifiedBusinessIncomeDeduction: DecimalMoneyString,
    estimated?: {
      expectedAgi: DecimalMoneyString,
      priorYearAgi: DecimalMoneyString,
      priorYearTotalTax: DecimalMoneyString,
    }
  },
}

interface TaxCategoryProps {
  type: string,
  description: string,
}

export interface TaxCategoriesProps {
  taxCategories: TaxCategoryProps[]
}

/** Validate the row-based net worth report returned by the API. */
export const isNetworthReport = (value: unknown): value is NetworthReportResponse => (
  Array.isArray(value)
  && value.every((row: unknown) => (
    Array.isArray(row)
    && row.every((cell: unknown) => typeof cell === 'string')
  ))
)

export interface AddTransactionRequest {
  date?: string;
  name?: string;
  amount?: DecimalMoneyString;
  principle?: DecimalMoneyString;
  comment?: string;
  categories: { categoryId: number; amount: DecimalMoneyString; comment?: string }[];
}

export interface UpdateTransactionRequest {
  version: number;
  date?: string;
  name?: string;
  amount?: DecimalMoneyString;
  principle?: DecimalMoneyString;
  comment?: string;
  statementId?: number | null;
  categories?: { categoryId: number; amount: DecimalMoneyString; comment?: string }[];
  taxCategories?: { type: string; amount: DecimalMoneyString }[];
}

export interface AddOfflineAccountRequest {
  name: string;
  balance: DecimalMoneyString;
  type: string;
  subtype: string;
  tracking: TrackingType;
  rate?: number;
  startDate: string;
}

export interface AddOfflineInstitutionRequest {
  institution: { name: string };
  accounts: Omit<AddOfflineAccountRequest, 'startDate'>[];
  startDate: string;
}
