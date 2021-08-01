import { makeAutoObservable } from 'mobx';
import { PendingTransactionProps } from './State';

class PendingTransaction {
  id: number | null;

  date: string;

  name: string;

  amount: number;

  constructor(props: PendingTransactionProps) {
    this.id = props.id;
    this.date = props.date;
    this.name = props.accountTransaction.name;
    this.amount = props.accountTransaction.amount;

    makeAutoObservable(this);
  }
}

export default PendingTransaction;
