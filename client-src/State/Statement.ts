import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import { observable, runInAction } from 'mobx';
import { ApiError, StatementProps, UpdateStatementProps, TrackingType } from '../../common/ResponseTypes';
import { StatementInterface, StatementsInterface } from './Types';

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
    this.id = props.id
    this.startDate = DateTime.fromISO(props.startDate)
    this.endDate = DateTime.fromISO(props.endDate)
    this.startingBalance = props.startingBalance
    this.endingBalance = props.endingBalance
    this.credits = props.credits
    this.debits = props.debits
    this.shortTermGains = props.data?.shortTermCapitalGains ?? 0
    this.longTermGains = props.data?.longTermCapitalGains ?? 0
    this.dividends = props.data?.dividends ?? 0
    this.taxableInterest = props.data?.taxableInterest ?? 0

    this.statements = statements
  }

  apply(props: StatementProps): void {
    if (props.id !== this.id || !DateTime.fromISO(props.startDate).isValid
      || !DateTime.fromISO(props.endDate).isValid
      || ![props.credits, props.debits, props.startingBalance, props.endingBalance].every(Number.isFinite)) {
      throw new Error('Invalid statement response');
    }
    runInAction(() => {
      this.credits = props.credits;
      this.debits = props.debits;
      this.startDate = DateTime.fromISO(props.startDate);
      this.endDate = DateTime.fromISO(props.endDate);
      this.startingBalance = props.startingBalance
      this.endingBalance = props.endingBalance;
      this.shortTermGains = props.data?.shortTermCapitalGains ?? 0
      this.longTermGains = props.data?.longTermCapitalGains ?? 0
      this.dividends = props.data?.dividends ?? 0
      this.taxableInterest = props.data?.taxableInterest ?? 0
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

    }

    return null;
  }  
}

export default Statement;
