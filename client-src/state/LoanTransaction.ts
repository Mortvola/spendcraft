import { LoanTransactionProps } from '../../common/ResponseTypes';

class LoanTransaction {
  id: number;

  date: string;

  name: string;

  principle: number;

  interest: number;

  constructor(props: LoanTransactionProps) {
    this.id = props.id;
    this.date = props.transactionCategory.transaction.date;
    this.name = props.transactionCategory.transaction.accountTransaction.name;
    this.principle = props.principle;
    this.interest = -props.transactionCategory.amount - props.principle;
  }
}

export default LoanTransaction;
