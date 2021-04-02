import { makeAutoObservable } from 'mobx';
import { PendingTransactionProps } from './State';

class PendingTransaction {
  id: number;

  date: string;

  name: string;

  amount: number;

  constructor(props: PendingTransactionProps) {
    this.id = props.id;
    this.date = props.date;
    this.name = props.name;
    this.amount = props.amount;

    makeAutoObservable(this);
  }
}

export default PendingTransaction;
