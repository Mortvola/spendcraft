import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import { observable, runInAction } from 'mobx';
import { ApiError, StatementProps, UpdateStatementProps } from '../../common/ResponseTypes';
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

  async update(update: UpdateStatementProps): Promise<ApiError[] | null> {
    const response = await Http.patch<UpdateStatementProps, StatementProps>(`/api/v1/statements/${this.id}`, update)

    if (response.ok) {
      const props = await response.body()

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

    return null;
  }

  async delete(): Promise<null | ApiError[]> {
    const response = await Http.delete(`/api/v1/statements/${this.id}`)

    if (response.ok) {
      this.statements.removeStatement(this.id);

      console.log('statement deleted')
    }

    return null;
  }  
}

export default Statement;
