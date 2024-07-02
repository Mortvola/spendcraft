import { DateTime } from 'luxon';
import { TransactionLogInterface, TransactionLogProps } from './State';

class TransactionLog implements TransactionLogInterface {
  id: number;

  date: DateTime;

  message: string;

  transactionId: number;

  constructor(props: TransactionLogProps) {
    this.id = props.id;
    this.date = DateTime.fromISO(props.createdAt);
    this.message = props.message;
    this.transactionId = props.transactionId;
  }
}

export default TransactionLog;
