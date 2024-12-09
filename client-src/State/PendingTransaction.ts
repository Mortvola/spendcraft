import { DateTime } from 'luxon';
import { makeAutoObservable } from 'mobx';
import { PendingTransactionProps, TransactionType } from '../../common/ResponseTypes';
import { StoreInterface, BaseTransactionInterface } from './Types';

class PendingTransaction implements BaseTransactionInterface {
  id: number | null;

  date: DateTime;

  name: string;

  type = TransactionType.REGULAR_TRANSACTION;

  amount: number;

  instituteName: string;

  accountName: string;

  accountOwner: string | null = null;

  statementId: number | null = null;

  pending = true;

  duplicateOfTransactionId: number | null = null;

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

  // eslint-disable-next-line class-methods-use-this
  toggleReconciled(statementId: number): void {
    throw Error('not implemented')
  }
}

export default PendingTransaction;
