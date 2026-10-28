import { decodeAmount } from '../monetary';
import { LoanTransactionProps } from '../../common/ResponseTypes';

class LoanTransaction {
  id: number;

  date: string;

  name: string;

  principle: number;

  interest: number;

  transactionId: number;

  transactionCategoryId: number;

  constructor(props: LoanTransactionProps) {
    this.id = props.id;
    this.date = props.transactionCategory.transaction.date;
    this.name = props.transactionCategory.transaction.accountTransaction.name;
    this.principle = decodeAmount(props.principle);
    this.interest = -decodeAmount(props.transactionCategory.amount) - this.principle;
    this.transactionCategoryId = props.transactionCategory.id;
    this.transactionId = props.transactionCategory.transaction.id;
  }
}

export default LoanTransaction;
