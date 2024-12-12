import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import { observable, runInAction } from 'mobx';
import { StatementProps } from '../../common/ResponseTypes';

export type UpdateStatementProps = Partial<StatementProps & {
  reconcile: 'All' | 'None'
}>

class Statement {
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

  constructor(
    props: {
      id: number,
      startDate: string,
      endDate: string,
      startingBalance: number,
      endingBalance: number,
      credits: number,
      debits: number,
    },
  ) {
    this.id = props.id
    this.startDate = DateTime.fromISO(props.startDate)
    this.endDate = DateTime.fromISO(props.endDate)
    this.startingBalance = props.startingBalance
    this.endingBalance = props.endingBalance
    this.credits = props.credits
    this.debits = props.debits
  }

  async update(update: UpdateStatementProps) {
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
      })
    }
  }
}

export default Statement;
