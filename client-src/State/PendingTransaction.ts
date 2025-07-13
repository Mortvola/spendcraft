import { DateTime } from 'luxon';
import { observable } from 'mobx';
import { PendingTransactionProps, TransactionType } from '../../common/ResponseTypes';
import { StoreInterface, BaseTransactionInterface } from './Types';

class PendingTransaction implements BaseTransactionInterface {
  @observable
  accessor id: number | null;

  @observable
  accessor date: DateTime;

  @observable
  accessor name: string;

  @observable
  accessor type = TransactionType.REGULAR_TRANSACTION;

  @observable
  accessor amount: number;

  @observable
  accessor instituteName: string;

  @observable
  accessor accountName: string;

  @observable
  accessor accountOwner: string | null = null;

  @observable
  accessor statementId: number | null = null;

  @observable
  accessor pending = true;

  @observable
  accessor duplicateOfTransactionId: number | null = null;

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
  }

   
  toggleReconciled(_statementId: number): void {
    throw Error('not implemented')
  }
}

export default PendingTransaction;
