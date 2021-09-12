import { DateTime } from 'luxon';
import { makeAutoObservable } from 'mobx';
import { PendingTransactionProps } from './State';

class PendingTransaction {
  id: number | null;

  date: string;

  createdAt: DateTime;

  name: string;

  amount: number;

  instituteName: string;

  accountName: string;

  constructor(props: PendingTransactionProps) {
    this.id = props.id;
    this.date = props.date;
    this.createdAt = DateTime.fromISO(props.createdAt);
    this.name = props.accountTransaction.name;
    this.amount = props.accountTransaction.amount;
    if (props.accountTransaction) {
      this.name = props.accountTransaction.name;
      this.amount = props.accountTransaction.amount;
      this.instituteName = props.accountTransaction.account.institution.name;
      this.accountName = props.accountTransaction.account.name;
    }
    else {
      this.name = 'Unknown';
      this.amount = 0;
      this.instituteName = '';
      this.accountName = '';
    }

    makeAutoObservable(this);
  }
}

export default PendingTransaction;
