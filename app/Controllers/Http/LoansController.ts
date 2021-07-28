// import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import Category from 'App/Models/Category';
import Group from 'App/Models/Group';
import Loan from 'App/Models/Loan';
// import LoanTransaction from 'App/Models/LoanTransaction';

export default class LoansController {
  // eslint-disable-next-line class-methods-use-this
  public async add({
    request,
    auth: { user },
  }: HttpContextContract): Promise<Loan> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const trx = await Database.transaction();

    const loanGroup = await Group.query({ client: trx })
      .where({ userId: user.id, system: true, name: 'Loans' })
      .firstOrFail();

    const category = (new Category()).useTransaction(trx);

    category.fill({
      name: request.input('name'),
      amount: -parseFloat(request.input('amount')),
      type: 'LOAN',
    });

    await category.related('group').associate(loanGroup);

    const loan = (new Loan()).useTransaction(trx);

    loan.fill({
      userId: user.id,
      rate: request.input('rate'),
      numberOfPayments: request.input('numberOfPayments'),
      paymentAmount: request.input('paymentAmount'),
    });

    await loan.related('category').associate(category);

    trx.commit();

    return loan;
  }

  // eslint-disable-next-line class-methods-use-this
  // public async getTransactions({
  //   request,
  //   auth: { user },
  // }: HttpContextContract): Promise<LoanTransaction[]> {
  //   if (!user) {
  //     throw new Error('user is not defined');
  //   }

  //   const loan = await Loan.findOrFail(request.params().loanId);

  //   await loan.load((loader) => {
  //     loader.load('loanTransactions', (loanTransaction) => {
  //       loanTransaction.preload('transaction', (transaction) => {
  //         transaction
  //           .preload('accountTransaction', (acctTransaction) => {
  //             acctTransaction.preload('account');
  //           })
  //           .preload('transactionCategories');
  //       });
  //     });
  //   });

  //   return loan.loanTransactions;
  // }
}
