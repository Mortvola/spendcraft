import { DateTime } from 'luxon';
import { makeAutoObservable } from 'mobx';
import { PendingTransactionProps, TransactionType } from '../../common/ResponseTypes';
import { StoreInterface, PendingTransactionInterface } from './State';

class PendingTransaction implements PendingTransactionInterface {
  id: number | null;

  date: DateTime;

  name: string;

  type = TransactionType.REGULAR_TRANSACTION;

  amount: number;

  instituteName: string;

  accountName: string;

  accountOwner: string | null = null;

  constructor(store: StoreInterface, props: PendingTransactionProps) {
    this.id = props.id;
    this.date = DateTime.fromISO(props.date);
    this.name = props.accountTransaction.name;
    this.amount = props.accountTransaction.amount;
    if (props.accountTransaction) {
      this.name = props.accountTransaction.name;
      this.amount = props.accountTransaction.amount;
      this.instituteName = props.accountTransaction.account.institution.name;
      this.accountName = props.accountTransaction.account.name;
      this.accountOwner = props.accountTransaction.accountOwner;
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
