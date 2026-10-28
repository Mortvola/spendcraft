import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import { observable, runInAction } from 'mobx';
import { ApiError, StatementProps, UpdateStatementProps, TrackingType } from '../../common/ResponseTypes';
import { StatementInterface, StatementsInterface } from './Types';

import { decodeAmount } from '../monetary';

function decodeStatementAmounts(props: StatementProps) {
  const income = props.data;
  if (income !== null && income !== undefined && (typeof income !== 'object' || Array.isArray(income))) {
    throw new Error('Invalid statement income response');
  }
  return {
    startingBalance: decodeAmount(props.startingBalance),
    endingBalance: decodeAmount(props.endingBalance),
    credits: decodeAmount(props.credits),
    debits: decodeAmount(props.debits),
    shortTermGains: income?.shortTermCapitalGains == null ? 0 : decodeAmount(income.shortTermCapitalGains),
    longTermGains: income?.longTermCapitalGains == null ? 0 : decodeAmount(income.longTermCapitalGains),
    dividends: income?.dividends == null ? 0 : decodeAmount(income.dividends),
    taxableInterest: income?.taxableInterest == null ? 0 : decodeAmount(income.taxableInterest),
  };
}

class Statement implements StatementInterface {
  @observable
  accessor id: number;

  @observable
  accessor startDate: DateTime

  @observable
  accessor endDate: DateTime

  @observable
  accessor startingBalance: number

  @observable
  accessor endingBalance: number

  @observable
  accessor credits: number

  @observable
  accessor debits: number

  @observable
  accessor shortTermGains: number

  @observable
  accessor longTermGains: number

  @observable
  accessor dividends: number

  @observable
  accessor taxableInterest: number

  statements: StatementsInterface

  constructor(
    props: StatementProps,
    statements: StatementsInterface,
  ) {
    const amounts = decodeStatementAmounts(props);
    this.id = props.id
    this.startDate = DateTime.fromISO(props.startDate)
    this.endDate = DateTime.fromISO(props.endDate)
    this.startingBalance = amounts.startingBalance
    this.endingBalance = amounts.endingBalance
    this.credits = amounts.credits
    this.debits = amounts.debits
    this.shortTermGains = amounts.shortTermGains
    this.longTermGains = amounts.longTermGains
    this.dividends = amounts.dividends
    this.taxableInterest = amounts.taxableInterest

    this.statements = statements
  }

  apply(props: StatementProps): void {
    const amounts = decodeStatementAmounts(props);
    if (props.id !== this.id || !DateTime.fromISO(props.startDate).isValid
      || !DateTime.fromISO(props.endDate).isValid) {
      throw new Error('Invalid statement response');
    }
    runInAction(() => {
      this.credits = amounts.credits;
      this.debits = amounts.debits;
      this.startDate = DateTime.fromISO(props.startDate);
      this.endDate = DateTime.fromISO(props.endDate);
      this.startingBalance = amounts.startingBalance
      this.endingBalance = amounts.endingBalance;
      this.shortTermGains = amounts.shortTermGains
      this.longTermGains = amounts.longTermGains
      this.dividends = amounts.dividends
      this.taxableInterest = amounts.taxableInterest
    })
  }

  async update(update: UpdateStatementProps): Promise<ApiError[] | null> {
    const response = await Http.patch<UpdateStatementProps, StatementProps>(`/api/v1/statements/${this.id}`, update)

    if (response.ok) {
      const props = await response.body()

      this.apply(props);
      runInAction(() => {
        this.statements.statements.sort((a, b) => b.endDate.toMillis() - a.endDate.toMillis());
      });
      if (update.reconcile !== undefined) {
        await this.statements.store.register.refreshReconciliation(this.statements.account.id);
      }
      if (this.statements.account.tracking === TrackingType.Balances) {
        await this.statements.store.accounts.load();
      }
    }

    return null;
  }

  async delete(): Promise<null | ApiError[]> {
    const response = await Http.delete(`/api/v1/statements/${this.id}`)

    if (response.ok) {
      runInAction(() => {
        this.statements.removeStatement(this.id);
        if (this.statements.store.uiState.selectedStatement === this) {
          this.statements.store.uiState.selectStatement(null);
        }
      });
      await this.statements.store.register.refreshReconciliation(this.statements.account.id);
      if (this.statements.account.tracking === TrackingType.Balances) {
        await this.statements.store.accounts.load();
      }
    } else {
      throw new Error('Statement deletion failed');
    }

    return null;
  }  
}

export default Statement;
