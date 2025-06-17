import { HttpContext } from '@adonisjs/core/http';
import { schema, rules } from '@adonisjs/validator';
import db from '@adonisjs/lucid/services/db';
import Category from '#app/Models/Category';
import Group from '#app/Models/Group';
import Loan from '#app/Models/Loan';
import { CategoryType, LoanTransactionsProps, LoanUpdateProps } from '#common/ResponseTypes';

export default class LoansController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    request,
    auth: { user },
  }: HttpContext): Promise<unknown> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const loan = await Loan.findByOrFail('categoryId', request.params().catId);

    return loan;
  }

  // eslint-disable-next-line class-methods-use-this
  public async add({
    request,
    auth: { user },
    logger,
  }: HttpContext): Promise<Category> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const validationSchema = schema.create({
      name: schema.string(),
      rate: schema.number(),
      startDate: schema.date(),
      amount: schema.number(),
    });

    const requestData = await request.validate({
      schema: validationSchema,
    });

    const trx = await db.transaction();

    try {
      const loanGroup = await Group.query({ client: trx })
        .where({ budgetId: budget.id, system: true, name: 'Loans' })
        .firstOrFail();

      const category = (new Category()).useTransaction(trx);

      category.fill({
        name: requestData.name,
        balance: 0,
        type: CategoryType.Loan,
      });

      await category.related('group').associate(loanGroup);

      const loan = (new Loan()).useTransaction(trx);

      loan.fill({
        budgetId: budget.id,
        rate: requestData.rate,
        startDate: requestData.startDate,
        startingBalance: requestData.amount,
        balance: -requestData.amount,
      });

      await loan.related('category').associate(category);

      await trx.commit();

      return category;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async update({
    request,
    auth: { user },
    logger,
  }: HttpContext): Promise<LoanUpdateProps> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const validationSchema = schema.create({
      name: schema.string([rules.trim()]),
      rate: schema.number(),
      startDate: schema.date(),
      startingBalance: schema.number(),
    });

    const requestData = await request.validate({
      schema: validationSchema,
    });

    const trx = await db.transaction();

    try {
      const loan = await Loan.findByOrFail('categoryId', request.params().catId, { client: trx });

      loan.merge({
        startDate: requestData.startDate,
        startingBalance: requestData.startingBalance,
        rate: requestData.rate,
      });

      await loan.updateBalance();

      const category = await loan.related('category').query().firstOrFail();

      category.merge({
        name: requestData.name,
      });

      await category.save();

      await trx.commit();

      return {
        name: category.name,
        loan: await loan.getProps(),
      }
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async getTransactions({
    request,
    auth: { user },
  }: HttpContext): Promise<LoanTransactionsProps> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const loan = await Loan.findByOrFail('categoryId', request.params().catId);

    return await loan.getProps();
  }
}
