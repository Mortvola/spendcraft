import { observable, runInAction } from "mobx";
import { AccountInterface, AddStatementRequest, StatementsInterface, StoreInterface } from "./Types";
import Statement from "./Statement";
import Http from "@mortvola/http";
import { AddStatementResponse, ApiError, StatementProps, StatementsResponse } from "../../common/ResponseTypes";

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
    const response = await Http.get<StatementsResponse>(`/api/v1/account/${this.account.id}/statements`);

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        this.statements = body.map((props) => new Statement(props, this))
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
  }

  async addStatement(
    startDate: string,
    endDate: string,
    startingBalance: number,
    endingBalance: number,
    shortTermCapitalGains: number,
    longTermCapitalGains: number,
    dividends: number,
    taxableInterest: number,
  ): Promise<ApiError[] | null> {
    const response = await Http.post<AddStatementRequest, AddStatementResponse>(`/api/v1/account/${this.account.id}/statements`, {
      startDate, endDate, startingBalance, endingBalance,
      data: {
        shortTermCapitalGains: shortTermCapitalGains,
        longTermCapitalGains: longTermCapitalGains,
        dividends,
        taxableInterest,
      }
    });

    if (response.ok) {
      const props = await response.body();

      runInAction(() => {
        const statement = new Statement(props, this)

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

        for (const transactionId of props.transactions) {
          const trx = this.account.transactions.transactions.find((trx) => trx.id === transactionId)
          if (trx) {
            trx.statementId = statement.id
          }
        }

        this.store.uiState.selectStatement(statement)
      })

      return null;
    }

    throw new Error('Error response received');
  }

  updateStatement(props: StatementProps): void {
    const statement = this.statements.find((s) => s.id === props.id)

    if (statement) {
      runInAction(() => {
        statement.credits = props.credits
        statement.debits = props.debits
      })
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
