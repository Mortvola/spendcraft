import { DateTime } from 'luxon';
import { BillProps } from '../../common/ResponseTypes';
import { BillInterface, CategoryInterface } from './Types';

class Bill implements BillInterface {
  date: DateTime | null;

  debits: number | null;

  category: CategoryInterface;

  constructor(props: BillProps, category: CategoryInterface) {
    this.category = category;
    this.date = props.goalDate ? DateTime.fromISO(props.goalDate) : null;
    this.debits = props.debits;
  }
}

export default Bill;
