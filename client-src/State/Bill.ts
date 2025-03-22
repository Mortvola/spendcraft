import { DateTime } from 'luxon';
import { BillProps } from '../../common/ResponseTypes';
import { BillInterface } from './Types';

class Bill implements BillInterface {
  id: number;

  name: string;

  amount: number;

  date: DateTime | null;

  recurrence: number;

  suspended: boolean;

  debits: number | null;

  constructor(props: BillProps) {
    this.id = props.id;
    this.name = props.name;
    this.amount = props.fundingAmount;
    this.date = props.goalDate ? DateTime.fromISO(props.goalDate) : null;
    this.recurrence = props.recurrence;
    this.suspended = props.suspended;
    this.debits = props.debits;
  }
}

export default Bill;
