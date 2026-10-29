import { parseMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { BillProps } from '../../common/ResponseTypes';
import { BillInterface, CategoryInterface } from './Types';

class Bill implements BillInterface {
  debitsCents: MoneyCents | null;

  category: CategoryInterface;

  constructor(props: BillProps, category: CategoryInterface) {
    this.category = category;
    this.debitsCents = props.debits === null ? null : parseMoneyCents(props.debits);
  }
}

export default Bill;
