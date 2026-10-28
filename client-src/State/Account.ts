import { formatMoneyCents, parseMoneyCents, addMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import {
  AccountProps, AddTransactionResponse, ErrorProps,
  isAddTransactionResponse, TrackingType, AccountType,
  isErrorResponse, ApiResponse, CategoryProps,
} from '../../common/ResponseTypes';
import {
  AccountInterface, InstitutionInterface, NewTransactionCategoryInterface, StoreInterface, TransactionCategoryInterface,
  AddTransactionRequest,
  AccountSettings,
} from './Types';
import Transaction from './Transaction';
import TransactionContainer from './TransactionContainer';
import Statements from './Statements';

class Account implements AccountInterface {
  id: number;

  plaidId: string | null;

  @observable
  accessor name: string;

  officialName: string | null = null;

  closed: boolean;

  type: AccountType;

  subtype: string;

  tracking: TrackingType;

  @observable
  accessor plaidBalanceCents: MoneyCents | null;

  startDate: DateTime | null;

  @observable
  accessor rate: number | null;

  @observable
  accessor institution: InstitutionInterface;

  @observable
  accessor balanceCents = parseMoneyCents('0.00');

  @observable
  accessor pendingBalanceCents = parseMoneyCents('0.00');

  transactions: TransactionContainer;

  pendingTransactions: TransactionContainer;

  @observable
  accessor statements: Statements;

  get totalBalanceCents(): MoneyCents {
    return addMoneyCents(this.balanceCents, this.pendingBalanceCents);
  }

  get sign(): number {
    return this.type === AccountType.Credit ? -1 : 1
  }

  store: StoreInterface;

  constructor(store: StoreInterface, institution: InstitutionInterface, props: AccountProps) {
    this.transactions = new TransactionContainer(
      store,
      `/api/v1/account/${props.id}/transactions`,
      (balance: string) => {
        this.balanceCents = parseMoneyCents(balance);
      },
    );

    this.pendingTransactions = new TransactionContainer(
      store, `/api/v1/account/${props.id}/transactions?pending=1`,
    );

    const balanceCents = parseMoneyCents(props.balance);
    const pendingBalanceCents = parseMoneyCents(props.pendingBalance);
    const plaidBalanceCents = props.plaidBalance === null ? null : parseMoneyCents(props.plaidBalance);
    this.id = props.id;
    this.plaidId = props.plaidId;
    this.name = props.name;
    this.closed = props.closed;
    this.type = props.type;
    this.subtype = props.subtype;
    this.tracking = props.tracking;
    this.balanceCents = balanceCents;
    this.pendingBalanceCents = pendingBalanceCents;
    this.plaidBalanceCents = plaidBalanceCents;
    this.startDate = props.startDate ? DateTime.fromISO(props.startDate) : null;
    this.rate = props.rate;
    this.institution = institution;

    this.statements = new Statements(this, store)

    this.store = store;
  }

  update(props: AccountProps): void {
    const balanceCents = parseMoneyCents(props.balance);
    const pendingBalanceCents = parseMoneyCents(props.pendingBalance);
    const plaidBalanceCents = props.plaidBalance === null ? null : parseMoneyCents(props.plaidBalance);
    this.id = props.id;
    this.plaidId = props.plaidId;
    this.name = props.name;
    this.closed = props.closed;
    this.type = props.type;
    this.subtype = props.subtype;
    this.tracking = props.tracking;
    this.balanceCents = balanceCents;
    this.pendingBalanceCents = pendingBalanceCents;
    this.plaidBalanceCents = plaidBalanceCents;
    this.startDate = props.startDate ? DateTime.fromISO(props.startDate) : null;
    this.rate = props.rate;

    this.transactions.url = `/api/v1/account/${props.id}/transactions`;
    this.pendingTransactions.url = `/api/v1/account/${props.id}/transactions?pending=1`;
  }

  async uploadOfx(file: File): Promise<void> {
    if (this.tracking !== TrackingType.Transactions) throw new Error('Account is not tracking transactions');
    const response = await Http.fetch(`/api/v1/account/${this.id}/ofx`, new Headers({
      Accept: 'application/json',
      'Content-Type': 'text/plain',
      Authorization: `Bearer ${Http.accessToken}`,
    }), { method: 'POST', body: file });
    if (!response.ok) throw new Error('OFX upload failed');

    // Refresh both independent balances from the server; no history is owned by OFX.
    await this.store.accounts.load();
    const categories = await Http.get<ApiResponse<{ categories: CategoryProps[] }>>('/api/v1/groups');
    if (!categories.ok) throw new Error('Unable to refresh category balances after OFX upload');
    const { data } = await categories.body();
    if (!Array.isArray(data?.categories) || !data.categories.every((category) =>
      category !== null && Number.isFinite(category.id) && typeof category.balance === 'string')) {
      throw new Error('Invalid category balances response');
    }
    this.store.categoryTree.updateBalances(data.categories);
    await this.transactions.getData(0);
    await this.pendingTransactions.getData(0);
    for (const props of data.categories) {
      const category = this.store.categoryTree.getCategory(props.id);
      if (category && category.transactions.transactions.length > 0) await category.transactions.getData(0);
    }
  }

  async setSettings(settings: AccountSettings): Promise<void> {
    const response = await Http.patch(`/api/v1/account/${this.id}`, {
      startDate: settings.startDate?.toISODate(),
      tracking: settings.tracking,
    });

    if (response.ok) {
      runInAction(() => {
        this.closed = settings.closed ?? this.closed;

        if (this.closed) {
          this.institution.closeAccount(this);
        }

        this.startDate = settings.startDate ?? this.startDate;
        this.tracking = settings.tracking ?? this.tracking;
      });
      if (settings.startDate !== undefined && this.tracking === TrackingType.Transactions) {
        await this.store.accounts.load();
        const categories = await Http.get<ApiResponse<{ categories: CategoryProps[] }>>('/api/v1/groups');
        if (!categories.ok) throw new Error('Unable to refresh category balances');
        const { data } = await categories.body();
        if (!Array.isArray(data?.categories) || !data.categories.every((category) =>
          category !== null && Number.isFinite(category.id) && typeof category.balance === 'string')) {
          throw new Error('Invalid category balances response');
        }
        this.store.categoryTree.updateBalances(data.categories);
        for (const props of data.categories) {
          const category = this.store.categoryTree.getCategory(props.id);
          if (category && category.transactions.transactions.length > 0) await category.transactions.getData(0);
        }
      }
    } else {
      throw new Error('Account settings update failed');
    }
  }

  async addTransaction(
    values: {
      date?: string,
      name?: string,
      amountCents?: MoneyCents,
      principleCents?: MoneyCents,
      categories: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<ErrorProps[] | null> {
    const { amountCents, principleCents, categories, ...metadata } = values;
    const response = await Http.post<AddTransactionRequest, AddTransactionResponse>(`/api/v1/account/${this.id}/transactions`, {
      ...metadata,
      amount: amountCents === undefined ? undefined : formatMoneyCents(amountCents),
      principle: principleCents === undefined ? undefined : formatMoneyCents(principleCents),
      categories: categories.map(({ amountCents: amount, ...category }) => ({ ...category, amount: formatMoneyCents(amount) })),
    });

    if (response.ok) {
      const body = await response.body();

      if (isAddTransactionResponse(body)) {
        const balanceCents = parseMoneyCents(body.acctBalances[0].balance);
        const transaction = new Transaction(this.store, body.transaction);
        runInAction(() => {
          this.store.categoryTree.updateBalances(body.categories);

          this.transactions.insertTransaction(transaction);

          this.balanceCents = balanceCents;
        });

        return null;
      }
    } else {
      const body = await response.body()

      if (isErrorResponse(body)) {
        return body.errors;
      }
    }

    throw new Error('Error response received');
  }
   
  delete(): void {
    this.institution.deleteAccount(this);
  }

  async updateOfflineAccount (name: string, type: AccountType, subtype: string): Promise<void> {
    const response = await Http.patch(`/api/v1/account/${this.id}`, {
      name,
      type,
      subtype,
    });

    if (response.ok) {
      runInAction(() => {
        this.name = name;
        this.type = type;
        this.subtype = subtype;
      });
    }
  }
}

export default Account;
