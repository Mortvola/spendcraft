import { formatMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { observable, runInAction } from "mobx";
import { AccountInterface, AddStatementRequest, StatementsInterface, StoreInterface } from
  "./Types";
import Statement from "./Statement";
import Http from "@mortvola/http";
import { AddStatementResponse, ApiError, StatementProps, StatementsResponse, TrackingType } from
  "../../common/ResponseTypes";

class Statements implements StatementsInterface {
  @observable
  accessor account: AccountInterface;

  @observable
  accessor statements: Statement[] = [];

  store: StoreInterface;

  constructor(account: AccountInterface, store: StoreInterface) {
    this.account = account;
    this.store = store;
  }

  async load(): Promise<void> {
    const response = await Http.get<StatementsResponse>(`/api/v1/account/${this.account
      .id}/statements`);

    if (!response.ok) throw new Error('Unable to refresh statements');
    const { data: body } = await response.body();
    if (!Array.isArray(body)) throw new Error('Invalid statements response');
    // Validate the complete response before changing shared cached instances.
    for (const props of body) {
      const candidate = new Statement(props, this);
      candidate.apply(props);
    }

    runInAction(() => {
      this.statements = body.map((props) => {
        const existing = this.statements.find((statement) => statement.id === props.id);
        if (existing) {
          existing.apply(props);
          return existing;
        }
        return new Statement(props, this);
      })
        .sort((a, b) => {
          if (a.endDate.startOf('day') > b.endDate.startOf('day')) {
            return -1
          }

          if (a.endDate.startOf('day') > b.endDate.startOf('day')) {
            return 1
          }

          return 0
        })
    });
  }

  async addStatement(
    startDate: string,
    endDate: string,
    startingBalanceCents: MoneyCents,
    endingBalanceCents: MoneyCents,
    shortTermCapitalGainsCents: MoneyCents,
    longTermCapitalGainsCents: MoneyCents,
    dividendsCents: MoneyCents,
    taxableInterestCents: MoneyCents,
  ): Promise<ApiError[] | null> {
    const response = await Http.post<AddStatementRequest, AddStatementResponse>(
      `/api/v1/account/${this.account.id}/statements`, {
      startDate, endDate, startingBalance: formatMoneyCents(startingBalanceCents),
        endingBalance: formatMoneyCents(endingBalanceCents),
      data: {
        shortTermCapitalGains: formatMoneyCents(shortTermCapitalGainsCents),
        longTermCapitalGains: formatMoneyCents(longTermCapitalGainsCents),
        dividends: formatMoneyCents(dividendsCents),
        taxableInterest: formatMoneyCents(taxableInterestCents),
      }
    });

    if (response.ok) {
      const { data: props } = await response.body();
      if (!props) throw new Error('Invalid statement creation response');
      const statement = new Statement(props, this);
      statement.apply(props);
      if (!Array.isArray(props.transactions) || !props.transactions.every(Number.isFinite)) {
        throw new Error('Invalid statement creation response');
      }

      runInAction(() => {
        this.statements = [
          ...this.statements,
          statement,
        ].sort((a, b) => {
          if (a.endDate.startOf('day') > b.endDate.startOf('day')) {
            return -1
          }

          if (a.endDate.startOf('day') > b.endDate.startOf('day')) {
            return 1
          }

          return 0
        })

        this.store.register.forEachTransaction((transaction) => {
          if (transaction.accountId === this.account.id && transaction.id !== null
            && props.transactions.includes(transaction.id)) transaction.statementId = statement.id;
        });

        this.store.uiState.selectStatement(statement)
      })

      if (this.account.tracking === TrackingType.Balances) await this.store.accounts.load();
      return null;
    }

    throw new Error('Error response received');
  }

  updateStatement(props: StatementProps): void {
    const statement = this.statements.find((s) => s.id === props.id)

    if (statement) {
      statement.applyTotals(props);
    }
  }

  removeStatement(statementId: number): void {
    const index = this.statements.findIndex((t) => t.id === statementId);

    if (index !== -1) {
      this.statements = [
        ...this.statements.slice(0, index),
        ...this.statements.slice(index + 1),
      ]
    }

  }
}

export default Statements;
