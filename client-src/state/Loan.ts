import { runInAction } from 'mobx';
import {
  isErrorResponse, LoanProps, Error, isUpdateLoanResponse,
} from '../../common/ResponseTypes';
import { GroupMemberInterface } from './State';
import { getBody, patchJSON } from './Transports';

class Loan implements GroupMemberInterface {
  id: number;

  name: string;

  balance: number;

  rate: number;

  numberOfPayments: number;

  paymentAmount: number;

  constructor(props: LoanProps | Loan) {
    this.id = props.id;
    this.name = props.name;
    this.balance = props.balance;
    this.rate = props.rate;
    this.numberOfPayments = props.numberOfPayments;
    this.paymentAmount = props.paymentAmount;
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
