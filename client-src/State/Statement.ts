import { DateTime } from 'luxon';
import { observable } from 'mobx';

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

  constructor(
    props: { id: number, startDate: string, endDate: string, startingBalance: number, endingBalance: number},
  ) {
    this.id = props.id
    this.startDate = DateTime.fromISO(props.startDate)
    this.endDate = DateTime.fromISO(props.endDate)
    this.startingBalance = props.startingBalance
    this.endingBalance = props.endingBalance
  }
}

export default Statement;
