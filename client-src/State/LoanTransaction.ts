import { parseMoneyCents, subtractMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { LoanTransactionProps } from '../../common/ResponseTypes';

class LoanTransaction {
  id: number;

  date: string;

  name: string;

  paymentCents: MoneyCents;

  principleCents: MoneyCents;

  interestCents: MoneyCents;

  transactionId: number;

  transactionCategoryId: number;

  constructor(props: LoanTransactionProps) {
    this.id = props.id;
    this.date = props.transactionCategory.transaction.date;
    this.name = props.transactionCategory.transaction.accountTransaction.name;
    this.paymentCents = subtractMoneyCents(parseMoneyCents('0.00'), parseMoneyCents(props
      .transactionCategory.amount));
    this.principleCents = parseMoneyCents(props.principle);
    this.interestCents = subtractMoneyCents(this.paymentCents, this.principleCents);
    this.transactionCategoryId = props.transactionCategory.id;
    this.transactionId = props.transactionCategory.transaction.id;
  }
}

export default LoanTransaction;
