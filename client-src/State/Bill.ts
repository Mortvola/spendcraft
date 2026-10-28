import { decodeAmount } from '../monetary';
import { BillProps } from '../../common/ResponseTypes';
import { BillInterface, CategoryInterface } from './Types';

class Bill implements BillInterface {
  debits: number | null;

  category: CategoryInterface;

  constructor(props: BillProps, category: CategoryInterface) {
    this.category = category;
    this.debits = props.debits === null ? null : decodeAmount(props.debits);
  }
}

export default Bill;
