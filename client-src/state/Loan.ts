import { makeAutoObservable, runInAction } from 'mobx';
import {
  isErrorResponse, LoanProps, Error, isUpdateLoanResponse,
  isLoanTransactionsResponse,
  CategoryType,
  CategoryProps,
} from '../../common/ResponseTypes';
import PendingTransaction from './PendingTransaction';
import { GroupMemberInterface, StoreInterface, TransactionCategoryInterface } from './State';
import Transaction from './Transaction';
import { getBody, patchJSON } from './Transports';

class Loan implements GroupMemberInterface {
  id: number;

  type: CategoryType = 'LOAN';

  name: string;

  balance: number;

  rate: number;

  numberOfPayments: number;

  paymentAmount: number;

  transactions: Transaction[] = [];

  pending: PendingTransaction[] = [];

  store: StoreInterface;

  fetching = false;

  constructor(props: LoanProps | Loan, store: StoreInterface) {
    this.id = props.id;
    this.name = props.name;
    this.balance = props.balance;
    this.rate = props.rate;
    this.numberOfPayments = props.numberOfPayments;
    this.paymentAmount = props.paymentAmount;
    this.store = store;

    makeAutoObservable(this);
  }

  async getTransactions(): Promise<void> {
    this.fetching = true;
    const response = await fetch(`/api/category/${this.id}/transactions`);

    const body = await getBody(response);

    if (response.ok && isLoanTransactionsResponse(body)) {
      body.sort((a, b) => {
        if (a.transactionCategory.transaction.date < b.transactionCategory.transaction.date) {
          return 1;
        }

        if (a.transactionCategory.transaction.date > b.transactionCategory.transaction.date) {
          return -1;
        }

        // if (a.transaction.sortOrder < b.transaction.sortOrder) {
        //   return 1;
        // }

        // if (a.transaction.sortOrder > b.transaction.sortOrder) {
        //   return -1;
        // }

        return 0;
      });

      runInAction(() => {
        if (body !== null) {
          // this.balance = body.balance;
          // this.pending = body.pending.map((pt) => new PendingTransaction(pt));
          // this.transactions = body.map((t) => (
          //   new Transaction(this.store, t)
          // ));
        }
        else {
          this.transactions = [];
        }

        this.fetching = false;
      });
    }
  }

  updateTransactionCategories(
    transactionId: number,
    categories: TransactionCategoryInterface[],
    balances: CategoryProps[],
  ): void {
  }

  async update(name: string): Promise<null | Array<Error>> {
    const response = await patchJSON(`/api/loans/${this.id}`, { name });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (isUpdateLoanResponse(body)) {
          this.name = body.name;
        }
      });
    }

    return null;
  }
}

export const isLoan = (r: unknown): r is Loan => (
  (r as Loan).id !== undefined
  && (r as Loan).name !== undefined
  && (r as Loan).balance !== undefined
  && (r as Loan).numberOfPayments !== undefined
  && (r as Loan).paymentAmount !== undefined
);

export default Loan;
