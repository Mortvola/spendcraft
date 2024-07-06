import { DateTime } from 'luxon';
import { CategoryProps } from '../../common/ResponseTypes';
import { BillInterface } from './Types';

class Bill implements BillInterface {
  id: number;

  name: string;

  amount: number;

  date: DateTime | null;

  constructor(props: CategoryProps) {
    this.id = props.id;
    this.name = props.name;
    this.amount = props.fundingAmount;
    this.date = props.goalDate ? DateTime.fromISO(props.goalDate) : null;
  }
}

export default Bill;
