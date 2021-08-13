// import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import { schema } from '@ioc:Adonis/Core/Validator';
import Database from '@ioc:Adonis/Lucid/Database';
import Category from 'App/Models/Category';
import Group from 'App/Models/Group';
import Loan from 'App/Models/Loan';
import { LoanTransactionsProps } from 'Common/ResponseTypes';
// import LoanTransaction from 'App/Models/LoanTransaction';

export default class LoansController {
  // eslint-disable-next-line class-methods-use-this
  public async add({
    request,
    auth: { user },
  }: HttpContextContract): Promise<Category> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const validationSchema = schema.create({
      name: schema.string(),
      rate: schema.number(),
      startDate: schema.date(),
      amount: schema.number(),
    });

    const requestData = await request.validate({
      schema: validationSchema,
    });

    const trx = await Database.transaction();

    const loanGroup = await Group.query({ client: trx })
      .where({ userId: user.id, system: true, name: 'Loans' })
      .firstOrFail();

    const category = (new Category()).useTransaction(trx);

    category.fill({
      name: requestData.name,
      amount: 0,
      type: 'LOAN',
    });

    await category.related('group').associate(loanGroup);

    const loan = (new Loan()).useTransaction(trx);

    loan.fill({
      userId: user.id,
      rate: requestData.rate,
      startDate: requestData.startDate,
      startingBalance: -requestData.amount,
      balance: -requestData.amount,
    });

    await loan.related('category').associate(category);

    await trx.commit();

    return category;
  }

  // eslint-disable-next-line class-methods-use-this
  public async getTransactions({
    request,
    auth: { user },
  }: HttpContextContract): Promise<LoanTransactionsProps> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const loan = await Loan.findByOrFail('categoryId', request.params().catId);

    return await loan.getProps();
  }
}
