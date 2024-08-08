/* eslint-disable import/no-cycle */
import { DateTime } from 'luxon'
import {
  BaseModel, column, HasMany, hasMany, ModelAdapterOptions,
} from '@ioc:Adonis/Lucid/Orm'
import Database from '@ioc:Adonis/Lucid/Database';
import { InstitutionProps, ProposedFundingCategoryProps } from 'Common/ResponseTypes';
import User from 'App/Models/User'
import Category from 'App/Models/Category';
import Group from 'App/Models/Group';
import Institution from 'App/Models/Institution';
import Transaction from 'App/Models/Transaction';
import Loan from 'App/Models/Loan';
import Logger from '@ioc:Adonis/Core/Logger';
import AutoAssignment from './AutoAssignment';
import TransactionLog from './TransactionLog';

export default class Budget extends BaseModel {
  public static table = 'applications';

  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true, serializeAs: null })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime

  @column()
  public userId: number;

  @hasMany(() => User)
  public users: HasMany<typeof User>;

  @hasMany(() => Institution)
  public institutions: HasMany<typeof Institution>;

  @hasMany(() => Transaction)
  public transactions: HasMany<typeof Transaction>;

  @hasMany(() => Loan)
  public loans: HasMany<typeof Loan>;

  @hasMany(() => Group)
  public groups: HasMany<typeof Group>;

  @hasMany(() => AutoAssignment)
  public autoAssignment: HasMany<typeof AutoAssignment>

  @hasMany(() => TransactionLog)
  public transactionLog: HasMany<typeof TransactionLog>

  public async getConnectedAccounts(this: Budget): Promise<InstitutionProps[]> {
    const result = await this
      .related('institutions').query()
      .preload('accounts');

    return result.map((i) => ({
      id: i.id,
      plaidInstitutionId: i.institutionId,
      name: i.name,
      offline: i.plaidItemId === null,
      syncDate: i.syncDate !== null && i.syncDate !== undefined ? i.syncDate.toISO() : null,
      accounts: i.accounts.map((a) => ({
        id: a.id,
        plaidId: a.plaidAccountId,
        name: a.name,
        closed: a.closed,
        type: a.type,
        subtype: a.subtype,
        tracking: a.tracking,
        balance: a.balance,
        plaidBalance: a.plaidBalance,
        startDate: a.startDate?.toISODate() ?? null,
        rate: a.rate,
      })),
    }));
  }

  public async getUnassignedCategory(options?: ModelAdapterOptions): Promise<Category> {
    return await Category.query(options)
      .where('type', 'UNASSIGNED')
      .whereHas('group', (query) => query.where('budgetId', this.id))
      .firstOrFail();
  }

  public async getFundingPoolCategory(options?: ModelAdapterOptions): Promise<Category> {
    return await Category.query(options)
      .where('type', 'FUNDING POOL')
      .whereHas('group', (query) => query.where('budgetId', this.id))
      .firstOrFail();
  }

  public async getAccountTransferCategory(options?: ModelAdapterOptions): Promise<Category> {
    return await Category.query(options)
      .where('type', 'ACCOUNT TRANSFER')
      .whereHas('group', (query) => query.where('budgetId', this.id))
      .firstOrFail();
  }

  public async getSystemGroup(options?: ModelAdapterOptions): Promise<Group> {
    return await Group.query(options)
      .where('type', 'SYSTEM')
      .andWhere('budgetId', this.id)
      .firstOrFail();
  }

  public async initialize(this: Budget): Promise<void> {
    if (this.$trx === undefined) {
      throw new Error('transaction must be defined');
    }

    const systemGroup = await (new Group()).useTransaction(this.$trx)
      .fill({
        name: 'System',
        type: 'SYSTEM',
        budgetId: this.id,
        system: true,
      })
      .save();

    await (new Category()).useTransaction(this.$trx)
      .fill({
        name: 'Unassigned',
        type: 'UNASSIGNED',
        balance: 0,
        groupId: systemGroup.id,
      })
      .save();

    await (new Category()).useTransaction(this.$trx)
      .fill({
        name: 'Funding Pool',
        type: 'FUNDING POOL',
        balance: 0,
        groupId: systemGroup.id,
      })
      .save();

    await (new Category()).useTransaction(this.$trx)
      .fill({
        name: 'Account Transfer',
        type: 'ACCOUNT TRANSFER',
        balance: 0,
        groupId: systemGroup.id,
      })
      .save();

    await (new Group()).useTransaction(this.$trx)
      .fill({
        name: 'NoGroup',
        type: 'NO GROUP',
        budgetId: this.id,
        system: true,
      })
      .save();

    await this.generateBudgetCategories();
  }

  private async generateBudgetCategories(): Promise<void> {
    const trx = this.$trx;

    if (trx === undefined) {
      throw new Error('transaction must be defined');
    }

    // Food Group

    const food = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Food',
        system: false,
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: food.id,
        name: 'Groceries',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: food.id,
        name: 'Dining Out',
        balance: 0.0,
      })
      .save();

    // No Group Group

    const noGroup = await Group.query({ client: trx })
      .where('budgetId', this.id)
      .andWhere('type', 'NO GROUP')
      .firstOrFail();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: noGroup.id,
        name: 'Entertainment',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: noGroup.id,
        name: 'Miscellaneous',
        balance: 0.0,
      })
      .save();

    // Home Improvement Group

    const homeImprovement = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Home Improvement',
        system: false,
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: homeImprovement.id,
        name: 'Maintenance',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: homeImprovement.id,
        name: 'Furniture',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: homeImprovement.id,
        name: 'Other',
        balance: 0.0,
      })
      .save();

    // Health Care Group

    const healthCare = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Health Care',
        system: false,
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: healthCare.id,
        name: 'Medical',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: healthCare.id,
        name: 'Dental',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: healthCare.id,
        name: 'Vision',
        balance: 0.0,
      })
      .save();

    // Insurance Group

    const insurance = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Insurance',
        system: false,
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: insurance.id,
        name: 'Medical',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: insurance.id,
        name: 'Dental',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: insurance.id,
        name: 'Vision',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: insurance.id,
        name: 'House/Car',
        balance: 0.0,
      })
      .save();

    // Bills Group

    const bills = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Bills',
        system: false,
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: bills.id,
        name: 'Electric',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: bills.id,
        name: 'Natural Gas',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: bills.id,
        name: 'Garbage/Recycling',
        balance: 0.0,
      })
      .save();

    // Taxes Group

    const taxes = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Taxes',
        system: false,
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: taxes.id,
        name: 'Federal',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: taxes.id,
        name: 'State',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: taxes.id,
        name: 'Property',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: taxes.id,
        name: 'Preparation Fees',
        balance: 0.0,
      })
      .save();

    // Car Group

    const car = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Car',
        system: false,
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: car.id,
        name: 'Gasoline',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: car.id,
        name: 'Maintenance',
        balance: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: car.id,
        name: 'Registration',
        balance: 0.0,
      })
      .save();
  }

  // eslint-disable-next-line class-methods-use-this
  public async getProposedFunding(): Promise<ProposedFundingCategoryProps[]> {
    const cats = await Category.query()
      .whereHas('group', (query) => {
        query.where('budgetId', this.id)
      });

    const fundingMonth = DateTime.now().startOf('month');

    const proposedCats: ProposedFundingCategoryProps[] = [];

    cats.forEach((cat) => {
      const proposedCat: ProposedFundingCategoryProps = {
        categoryId: cat.id,
        amount: 0,
        adjusted: false,
        adjustedReason: null,
        fundingCategories: cat.fundingCategories,
        includeFundingTransfers: cat.includeFundingTransfers,
      };

      if (cat.useGoal && cat.goalDate) {
        let goalMonth = cat.goalDate.startOf('month');

        let monthDiff = goalMonth.diff(fundingMonth, 'months').months;
        if (monthDiff < 0) {
          const numPeriods = Math.ceil(-monthDiff / cat.recurrence);
          monthDiff += numPeriods * cat.recurrence;
          goalMonth = fundingMonth.plus({ months: monthDiff })
        }

        // TODO: use the planCat.amount sans any transactions this month
        const goalDiff = cat.fundingAmount - cat.balance;

        let monthlyAmount = 0.0;

        // if (monthDiff > 0) {
        if (goalDiff > 0) {
          monthlyAmount = Math.round((goalDiff / (monthDiff + 1)) * 100) / 100.0;
        }

        proposedCat.amount = monthlyAmount;

        const plannedAmount = Math.round((cat.fundingAmount / cat.recurrence) * 100) / 100.0;

        if (monthlyAmount !== plannedAmount) {
          proposedCat.adjusted = true;
          proposedCat.adjustedReason = `The funding amount was adjusted from a planned amount of ${plannedAmount.toFixed(2)} to ${monthlyAmount.toFixed(2)} for the goal of ${cat.fundingAmount} due ${goalMonth.month}-${goalMonth.year}.`;
        }
      }
      else {
        proposedCat.amount = cat.fundingAmount;
        // const plannedAmount = planCat.amount / planCat.recurrence;
        // let monthlyAmount = plannedAmount;

        // // Adjust the monthly amount if this is a required amount (a bill)
        // // so that there is enough of a balance to meet its requirement
        // if (cat.amount < 0) {
        //   monthlyAmount = plannedAmount - cat.amount

        //   proposedCat.adjusted = true;
        // eslint-disable-next-line max-len
        //   proposedCat.adjustedReason = `The funding amount was adjusted from a planned amount of ${plannedAmount} to ${monthlyAmount}.`
        // }

        // proposedCat.amount = monthlyAmount;

        // if (planCat.expectedToSpend !== null) {
        //   proposedCat.expectedToSpend = planCat.expectedToSpend;
        // }
        // else {
        //   const balance = cat.amount + monthlyAmount;
        //   proposedCat.expectedToSpend = balance > 0 ? balance : 0;
        // }
      }

      proposedCats.push(proposedCat)
    })

    return proposedCats;
  }

  // eslint-disable-next-line class-methods-use-this
  public async syncCategoryBalances(this: Budget): Promise<void> {
    const trx = await Database.transaction();

    try {
      const categories = await Category.query({ client: trx })
        .whereHas('group', (q) => {
          q.where('budgetId', this.id)
          // q.whereHas('budget', (q2) => {
          //   q2.where('applicationId', this.id)
          // })
        });

      await Promise.all(categories.map(async (cat) => cat.syncBalance()));

      await trx.commit();
    }
    catch (error) {
      Logger.error(error);
      trx.rollback();
    }
  }
}
