export interface GroupProps {
  id: number;

  name: string;

  system: boolean;

  categories: Array<CategoryProps>;
}

export const isGroupProps = (
  r: GroupProps | unknown,
): r is GroupProps => (
  (r as GroupProps).id !== undefined
  && (r as GroupProps).name !== undefined
  // && (r as GroupProps).system !== undefined
  // && (r as GroupProps).categories !== undefined
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

export interface CategoryProps {
  groupId: number;

  id: number;

  balance: number;

  name: string;

  system: boolean;
}

export type AddCategoryResponse = CategoryProps

export const isAddCategoryResponse = (
  r: AddCategoryResponse | unknown,
): r is AddCategoryResponse => (
  (r as AddCategoryResponse).groupId !== undefined
  && (r as AddCategoryResponse).id !== undefined
  && (r as AddCategoryResponse).balance !== undefined
  && (r as AddCategoryResponse).name !== undefined
  && (r as AddCategoryResponse).system !== undefined
);

export interface UpdateCategoryResponse {
  name: string;
}

export const isUpdateCategoryResponse = (
  r: UpdateCategoryResponse | unknown,
): r is UpdateCategoryResponse => (
  (r as UpdateCategoryResponse).name !== undefined
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

  accounts: Array<AccountProps>
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

  categoryId: number;

  amount: number;
}

export interface TransactionProps {
  id: number;

  date: string;

  sortOrder: number;

  amount: number;

  type: string;

  name: string;

  categories: Array<TransactionCategoryProps>
}

export interface CategoryTransactionsResponse {
  transactions: Array<TransactionProps>;

  pending: Array<TransactionProps>;

  balance: number;
}

export const isCategoryTransactionsResponse = (
  r: CategoryTransactionsResponse | unknown,
): r is CategoryTransactionsResponse => (
  (r as CategoryTransactionsResponse).transactions !== undefined
  && (r as CategoryTransactionsResponse).pending !== undefined
  && (r as CategoryTransactionsResponse).balance !== undefined
);

export interface AccountTransactionsResponse {
  transactions: Array<TransactionProps>;

  pending: Array<TransactionProps>;

  balance: number;
}

export const isAccountTransactionsResponse = (
  r: AccountTransactionsResponse | unknown,
): r is AccountTransactionsResponse => (
  (r as AccountTransactionsResponse).transactions !== undefined
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
  splits: Array<TransactionCategoryProps>;

  categories: Array<CategoryProps>;
}

export const isUpdateTransactionCategoryResponse = (
  r: UpdateTransactionCategoryResponse | unknown,
): r is UpdateTransactionCategoryResponse => (
  (r as UpdateTransactionCategoryResponse).splits !== undefined
  && (r as UpdateTransactionCategoryResponse).categories !== undefined
  && ((r as UpdateTransactionCategoryResponse).categories.length === 0
  || isCategoryBalance((r as UpdateTransactionCategoryResponse).categories[0]))
);

export const isGroupsResponse = (r: Array<GroupProps> | unknown): r is Array<GroupProps> => (
  (r as Array<GroupProps>).length === 0 || isGroupProps((r as Array<GroupProps>)[0])
);

export const isAccountsResponse = (r: Array<AccountProps> | unknown): r is Array<AccountProps> => (
  (r as Array<AccountProps>).length === 0 || isAccountProps((r as Array<AccountProps>)[0])
);

export interface FundingPlanCategoryProps {
  id: number;

  amount: number;
}

export interface FundingPlanGroupProps {
  id: number;

  categories: Array<FundingPlanCategoryProps>;

  name: string;

  system: boolean;
}

export interface FundingPlanDetailsProps {
  id: number;

  history: Array<unknown>

  total: number;

  groups: Array<FundingPlanGroupProps>;
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
