import { runInAction } from 'mobx';
import {
  LoanGroupProps, isAddLoanResponse, Error, isErrorResponse, CategoryProps, LoanProps,
} from '../../common/ResponseTypes';
import Loan, { isLoan } from './Loan';
import { GroupInterface } from './State';
import { getBody, httpDelete, postJSON } from './Transports';

class LoansGroup implements GroupInterface {
  id: number;

  name: string;

  categories: Loan[] = [];

  system = true;

  constructor(props: LoanGroupProps | LoansGroup) {
    this.id = props.id;
    this.name = props.name;

    if (props.categories && props.categories.length > 0) {
      props.categories.forEach((l) => {
        const loan = new Loan(l);
        this.categories.push(loan);
      });
    }
  }

  findCategory(categoryId: number): Loan | null {
    const loan = this.categories.find((c) => c.id === categoryId);

    if (loan) {
      return loan;
    }

    return null;
  }

  async addLoan(
    name: string,
    amount: number,
    rate: number,
    numberOfPayments: number,
    paymentAmount: number,
  ): Promise<null| Error[]> {
    const response = await postJSON('/api/loans', {
      name, amount, rate, numberOfPayments, paymentAmount,
    });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (isAddLoanResponse(body)) {
          // Find the position where this new category should be inserted.
          const index = this.categories.findIndex(
            (g) => body.name.toLowerCase().localeCompare(g.name.toLowerCase()) < 0,
          );

          if (index === -1) {
            this.categories.push(new Loan(body));
          }
          else {
            this.categories = [
              ...this.categories.slice(0, index),
              new Loan(body),
              ...this.categories.slice(index),
            ];
          }
        }
      });
    }

    return null;
  }

  updateBalances(balances: CategoryProps[]): void {
    this.categories.forEach((c) => {
      const balance = balances.find((b) => b.id === c.id);
      if (balance) {
        c.balance = balance.balance;
      }
    });
  }

  async deleteLoan(loanId: number): Promise<null | Array<Error>> {
    const index = this.categories.findIndex((c) => c.id === loanId);

    if (index !== -1) {
      const response = await httpDelete(`/api/loans/${loanId}`);

      const body = await getBody(response);

      if (!response.ok) {
        if (isErrorResponse(body)) {
          return body.errors;
        }
      }
      else {
        runInAction(() => {
          this.categories.splice(index, 1);
        });
      }
    }

    return null;
  }
}

export const isLoansGroup = (r: unknown): r is LoansGroup => (
  (r as LoansGroup).id !== undefined
  && (r as LoansGroup).name === 'Loans'
  && (r as LoansGroup).system !== undefined
  && (r as LoansGroup).system
  && (r as LoansGroup).categories !== undefined
);

export const isLoanArray = (r: unknown): r is Loan[] => (
  (Array.isArray(r))
  && isLoan(r[0])
);

export default LoansGroup;
