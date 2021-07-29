export interface GroupProps {
  id: number;

  name: string;

  system: boolean;

  categories: CategoryProps[];
}

export const isGroupProps = (
  r: GroupProps | unknown,
): r is GroupProps => (
  (r as GroupProps).id !== undefined
  && (r as GroupProps).name !== undefined
  // && (r as GroupProps).system !== undefined
  // && (r as GroupProps).categories !== undefined
);

export interface LoanGroupProps {
  id: number;

  name: string;

  system: boolean;

  categories: CategoryProps[];
}

export const isLoanGroupProps = (r: unknown): r is LoanGroupProps => (
  (r as LoanGroupProps).id !== undefined
  && (r as LoanGroupProps).name !== undefined
  // && (r as GroupProps).system !== undefined
  // && (r as GroupProps).categories !== undefined
);

export const isLoanPropsArray = (r: unknown): r is LoanProps[] => (
  (Array.isArray(r))
  && (r[0] as LoanProps).id !== undefined
  && (r[0] as LoanProps).name !== undefined
  && (r[0] as LoanProps).balance !== undefined
  && (r[0] as LoanProps).numberOfPayments !== undefined
  && (r[0] as LoanProps).paymentAmount !== undefined
);

export interface CategoryBalance {
  id: number;

  balance: number;
}

export const isCategoryBalance = (
  r: CategoryProps | unknown,
): r is CategoryProps => (
  (r as CategoryProps).id !== undefined
  && (r as CategoryProps).balance !== undefined
);

export type CategoryType = 'REGULAR' | 'UNASSIGNED' | 'FUNDING POOL' | 'ACCOUNT TRANSFER' | 'LOAN';

export interface CategoryProps {
  groupId: number | null;

  id: number;

  balance: number;

  name: string;

  type: CategoryType;
}

export const isCategoryBalance2 = (
  r: CategoryBalanceProps | unknown,
): r is CategoryBalanceProps => (
  (r as CategoryBalanceProps).id !== undefined
  && (r as CategoryBalanceProps).balance !== undefined
);

export interface CategoryBalanceProps {
  id: number;

  balance: number;
}

export type AddCategoryResponse = CategoryProps

export const isAddCategoryResponse = (
  r: AddCategoryResponse | unknown,
): r is AddCategoryResponse => (
  (r as AddCategoryResponse).groupId !== undefined
  && (r as AddCategoryResponse).id !== undefined
  && (r as AddCategoryResponse).balance !== undefined
  && (r as AddCategoryResponse).name !== undefined
  && (r as AddCategoryResponse).type !== undefined
);

export interface UpdateCategoryResponse {
  name: string;
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

export interface LoanProps {
  id: number;

  name: string;

  balance: number;

  numberOfPayments: number;

  paymentAmount: number;

  rate: number;
}

export const isAddLoanResponse = (r: unknown): r is LoanProps => (
  ((r as LoanProps).id !== undefined
  && (r as LoanProps).balance !== undefined
  && (r as LoanProps).name !== undefined
  && (r as LoanProps).paymentAmount !== undefined
  && (r as LoanProps).rate !== undefined)
);

export interface UpdateFundingCategoryResponse {
  amount: number;
  categoryId: number;
}

export const isUpdateFundingCategoryResponse = (
  r: UpdateFundingCategoryResponse | unknown,
): r is UpdateFundingCategoryResponse => (
  (r as UpdateFundingCategoryResponse).amount !== undefined
  && (r as UpdateFundingCategoryResponse).categoryId !== undefined
);

export const isCategoryProps = (
  r: CategoryProps | unknown,
): r is CategoryProps => (
  (r as CategoryProps).id !== undefined
  // && (r as CategoryProps).balance !== undefined
  && (r as CategoryProps).name !== undefined
  // && (r as CategoryProps).system !== undefined
);

export interface AccountProps {
  id: number;

  name: string;

  tracking: string;

  syncDate: string;

  balance: number;
}

export const isAccountProps = (
  r: AccountProps | unknown,
): r is AccountProps => (
  (r as AccountProps).id !== undefined
  && (r as AccountProps).name !== undefined
  && (r as AccountProps).tracking !== undefined
  && (r as AccountProps).syncDate !== undefined
  && (r as AccountProps).balance !== undefined
);

export interface InstitutionProps {
  id: number;

  name: string;

  accounts: AccountProps[];
}

export const isInstitutionProps = (
  r: InstitutionProps | unknown,
): r is InstitutionProps => (
  (r as InstitutionProps).id !== undefined
  && (r as InstitutionProps).name !== undefined
  && (r as InstitutionProps).accounts !== undefined
);

export const isInstitutionsResponse = (
  r: Array<InstitutionProps> | unknown,
): r is Array<InstitutionProps> => (
  (r as Array<InstitutionProps>).length === 0
  || isInstitutionProps((r as Array<InstitutionProps>)[0])
);

export interface TransactionCategoryProps {
  id: number;

  type: CategoryType;

  categoryId: number;

  amount: number;

  loanTransaction: null | {
    principle: number;
  };
}

export enum TransactionType {
  REGULAR_TRANSACTION = 0,
  TRANSFER_TRANSACTION = 1,
  FUNDING_TRANSACTION = 2,
  REBALANCE_TRANSACTION = 3,
  STARTING_BALANCE = 4,
}

export interface TransactionProps {
  id: number | null;

  date: string;

  sortOrder: number;

  type: TransactionType;

  transactionCategories: TransactionCategoryProps[];

  accountTransaction: {
    name: string;

    amount: number;

    account: {
      name: string;

      institution: {
        name: string;
      }
    }
  }
}

export const isTransactionProps = (r: unknown): r is TransactionProps => (
  r !== undefined
);

export interface CategoryTransactionsResponse {
  transactions: TransactionProps[];

  pending: TransactionProps[];

  loan: {
    balance: number;
    transactions: LoanTransactionProps[];
  };

  balance: number;
}

export const isCategoryTransactionsResponse = (r: unknown): r is CategoryTransactionsResponse => (
  r !== undefined && r !== null
  && (r as CategoryTransactionsResponse).transactions !== undefined
  && (r as CategoryTransactionsResponse).pending !== undefined
  && (r as CategoryTransactionsResponse).balance !== undefined
);

export type LoanTransactionProps = {
  id: number;

  principle: number;

  loanId: number;

  transactionCategory: {
    amount: number;

    transaction: {
      date: string;

      accountTransaction: {
        name: string;
      }
    }
  }
}

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

export interface AccountTransactionsResponse {
  transactions: Array<TransactionProps>;

  pending: Array<TransactionProps>;

  balance: number;
}

export const isAccountTransactionsResponse = (r: unknown): r is AccountTransactionsResponse => (
  r !== undefined && r !== null
  && (r as AccountTransactionsResponse).transactions !== undefined
  && (r as AccountTransactionsResponse).pending !== undefined
  && (r as AccountTransactionsResponse).balance !== undefined
);

export interface Error {
  title: string;
}

export interface ErrorResponse {
  errors: Array<Error>;
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

export interface UpdateTransactionCategoryResponse {
  splits: TransactionCategoryProps[];

  categories: CategoryProps[];
}

export const isUpdateTransactionCategoryResponse = (
  r: UpdateTransactionCategoryResponse | unknown,
): r is UpdateTransactionCategoryResponse => (
  (r as UpdateTransactionCategoryResponse).splits !== undefined
  && (r as UpdateTransactionCategoryResponse).categories !== undefined
  && ((r as UpdateTransactionCategoryResponse).categories.length === 0
  || isCategoryBalance((r as UpdateTransactionCategoryResponse).categories[0]))
);

export interface UpdateCategoryTransferReponse {
  balances: { id: number, balance: number }[],

  transaction: {
    categories: TransactionCategoryProps[],
  },
}

export const isUpdateCategoryTransferResponse = (
  r: UpdateCategoryTransferReponse | unknown,
): r is UpdateCategoryTransferReponse => (
  (r as UpdateCategoryTransferReponse).balances !== undefined
  && (r as UpdateCategoryTransferReponse).balances !== undefined
  && ((r as UpdateCategoryTransferReponse).balances.length === 0
  || isCategoryBalance2((r as UpdateCategoryTransferReponse).balances[0]))
);

export interface DeleteTransactionResponse {
  balances: { id: number, balance: number }[],
}

export const isDeleteTransactionResponse = (
  r: DeleteTransactionResponse | unknown,
): r is DeleteTransactionResponse => (
  (r as DeleteTransactionResponse).balances !== undefined
  && (r as DeleteTransactionResponse).balances !== undefined
  && ((r as DeleteTransactionResponse).balances.length === 0
  || isCategoryBalance2((r as DeleteTransactionResponse).balances[0]))
);

export interface InsertCategoryTransferReponse {
  balances: { id: number, balance: number }[],

  transaction: TransactionProps,
}

export const isInsertCategoryTransferResponse = (
  r: InsertCategoryTransferReponse | unknown,
): r is InsertCategoryTransferReponse => (
  (r as InsertCategoryTransferReponse).balances !== undefined
  && (r as InsertCategoryTransferReponse).balances !== undefined
  && ((r as InsertCategoryTransferReponse).balances.length === 0
  || isCategoryBalance2((r as InsertCategoryTransferReponse).balances[0]))
);

export const isGroupsResponse = (r: Array<GroupProps> | unknown): r is Array<GroupProps> => (
  (r as Array<GroupProps>).length === 0 || isGroupProps((r as Array<GroupProps>)[0])
);

export const isAccountsResponse = (r: Array<AccountProps> | unknown): r is Array<AccountProps> => (
  (r as Array<AccountProps>).length === 0 || isAccountProps((r as Array<AccountProps>)[0])
);

export interface FundingPlanCategoryProps {
  id: number;

  categoryId: number;

  amount: number;

  name: string;
}

export interface FundingPlanGroupProps {
  id: number;

  categories: Array<FundingPlanCategoryProps>;

  name: string;

  system: boolean;
}

export interface HistoryMonthProps {
  year: number;

  month: number;

  amount: number;
}

export interface HistoryCategoryProps {
  id: number;

  months: HistoryMonthProps[];
}

export interface HistoryGroupProps {
  id: number;

  name: string;

  categories: HistoryCategoryProps[];
}

export interface FundingPlanDetailsProps {
  id: number;

  history: HistoryGroupProps[];

  total: number;

  groups: FundingPlanGroupProps[];
}

export interface UpdateCategoryProps {
  amount: number;
}

export const isFundingPlanDetailsProps = (
  r: FundingPlanDetailsProps| unknown,
): r is FundingPlanDetailsProps => (
  (r as FundingPlanDetailsProps).id !== undefined
  && (r as FundingPlanDetailsProps).history !== undefined
  && (r as FundingPlanDetailsProps).total !== undefined
  && (r as FundingPlanDetailsProps).groups !== undefined
);

export interface FundingPlanProps {
  id: number;

  name: string;
}

export const isFundingPlanProps = (r: FundingPlanProps | unknown): r is FundingPlanProps => (
  (r as FundingPlanProps).id !== undefined
  && (r as FundingPlanProps).name !== undefined
);

export const isFundingPlansResponse = (
  r: Array<FundingPlanProps> | unknown,
): r is Array<FundingPlanProps> => (
  (r as Array<FundingPlanProps>).length === 0
  || isFundingPlanProps((r as Array<FundingPlanProps>)[0])
);

export interface AccountSyncProps {
  syncDate: string;

  balance: number;
}

export interface AccountSyncResponse {
  accounts: Array<AccountSyncProps>;
  categories: Array<CategoryProps>;
}

export const isAccountSyncResponse = (
  r: AccountSyncResponse | unknown,
): r is AccountSyncResponse => (
  (r as AccountSyncResponse).accounts !== undefined
  && (r as AccountSyncResponse).categories !== undefined
);

export interface LinkTokenProps {
  linkToken: string;
}

export const isLinkTokenResponse = (
  r: LinkTokenProps | unknown,
): r is LinkTokenProps => (
  (r as LinkTokenProps).linkToken !== undefined
);

export interface BalanceProps {
  balance: number;
}

export const isBalanceProps = (
  r: BalanceProps | unknown,
): r is BalanceProps => (
  (r as BalanceProps).balance !== undefined
);

export const isBalancesResponse = (
  r: Array<BalanceProps> | unknown,
): r is Array<BalanceProps> => (
  (r as Array<BalanceProps>).length === 0
  || isBalanceProps((r as Array<BalanceProps>)[0])
);

export interface UserProps {
  username: string;
}

export const isUserProps = (
  r: UserProps | unknown,
): r is UserProps => (
  (r as UserProps).username !== undefined
);
