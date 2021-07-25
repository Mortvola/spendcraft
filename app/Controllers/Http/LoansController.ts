// import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Loan from 'App/Models/Loan';

export default class LoansController {
  // eslint-disable-next-line class-methods-use-this
  public async add({
    request,
    auth: { user },
  }: HttpContextContract): Promise<Loan> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const loan = new Loan();

    loan.fill({
      name: request.input('name'),
      amount: request.input('amount'),
      rate: request.input('rate'),
      numberOfPayments: request.input('numberOfPayments'),
      paymentAmount: request.input('paymentAmount'),
    });

    await loan.related('user').associate(user);

    return loan;
  }
}
