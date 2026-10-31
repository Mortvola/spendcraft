import {
  subtractMoneyCents, parseMoneyCents, formatMoneyCents, moneyCentsFromInteger,
} from '#common/moneyCents';
import { encodeMonetaryAmount } from '#services/categoryAmountCodec';
import { DateTime } from 'luxon'
import {
  BaseModel, column, hasMany
} from '@adonisjs/lucid/orm'
import db from '@adonisjs/lucid/services/db';
import {
  CategoryType, GroupType, InstitutionProps, ProposedFundingCategoryProps,
} from '#common/ResponseTypes';
import User from '#app/Models/User'
import Category from '#app/Models/Category';
import Group from '#app/Models/Group';
import Institution from '#app/Models/Institution';
import Transaction from '#app/Models/Transaction';
import logger from '@adonisjs/core/services/logger';
import AutoAssignment from './AutoAssignment.js';
import TransactionLog from './TransactionLog.js';
import type { HasMany } from "@adonisjs/lucid/types/relations";
import { ModelAdapterOptions } from "@adonisjs/lucid/types/model";
import Tax from './Tax.ts';

type ProposedFundingCategory = Omit<ProposedFundingCategoryProps, 'amount' |
  'fundingCategories'> & {
  amount: number;
  fundingCategories: { categoryId: number, amount: number, percentage: boolean }[];
};

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

  @hasMany(() => Group)
  public groups: HasMany<typeof Group>;

  @hasMany(() => AutoAssignment)
  public autoAssignment: HasMany<typeof AutoAssignment>

  @hasMany(() => TransactionLog)
  public transactionLog: HasMany<typeof TransactionLog>

  @hasMany(() => Tax)
  public tax: HasMany<typeof Tax>

  public async getConnectedAccounts(this: Budget): Promise<InstitutionProps[]> {
    const result = await this
      .related('institutions').query()
      .preload('accounts', (accountsQuery) => {
        accountsQuery.withAggregate('accountTransactions', (query) => {
          query.sum('amount').as('pendingBalance')
          .where('pending', true)
          .whereHas('transaction', (transaction) => {
            transaction.where('deleted', false)
          })
        })
      })

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
        balance: formatMoneyCents(a.balanceCents),
        pendingBalance: encodeMonetaryAmount(a.$extras.pendingBalance ?? '0.00'),
        plaidBalance: a.plaidBalance == null ? null : encodeMonetaryAmount(a.plaidBalance),
        startDate: a.startDate?.toISODate() ?? null,
        rate: a.rate,
      })),
    }));
  }

  public async getUnassignedCategory(options?: ModelAdapterOptions): Promise<Category> {
    return await Category.query(options)
      .where('type', CategoryType.Unassigned)
      .whereHas('group', (query) => query.where('budgetId', this.id))
      .firstOrFail();
  }

  public async getFundingPoolCategory(options?: ModelAdapterOptions): Promise<Category> {
    return await Category.query(options)
      .where('type', CategoryType.FundingPool)
      .whereHas('group', (query) => query.where('budgetId', this.id))
      .firstOrFail();
  }

  public async getAccountTransferCategory(options?: ModelAdapterOptions): Promise<Category> {
    return await Category.query(options)
      .where('type', CategoryType.AccountTransfer)
      .whereHas('group', (query) => query.where('budgetId', this.id))
      .firstOrFail();
  }

  public async getSystemGroup(options?: ModelAdapterOptions): Promise<Group> {
    return await Group.query(options)
      .where('type', GroupType.System)
      .andWhere('budgetId', this.id)
      .firstOrFail();
  }

  public async initialize(this: Budget): Promise<void> {
    if (this.$trx === undefined) {
      throw new Error('transaction must be defined');
    }

    const systemGroup = await (new Group())
      .useTransaction(this.$trx)
      .fill({
        name: 'System',
        type: GroupType.System,
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(this.$trx)
      .fill({
        name: 'Unassigned',
        type: CategoryType.Unassigned,
        balanceCents: parseMoneyCents('0.00'),
        groupId: systemGroup.id,
      })
      .save();

    await (new Category())
      .useTransaction(this.$trx)
      .fill({
        name: 'Funding Pool',
        type: CategoryType.FundingPool,
        balanceCents: parseMoneyCents('0.00'),
        groupId: systemGroup.id,
      })
      .save();

    await (new Category())
      .useTransaction(this.$trx)
      .fill({
        name: 'Account Transfer',
        type: CategoryType.AccountTransfer,
        balanceCents: parseMoneyCents('0.00'),
        groupId: systemGroup.id,
      })
      .save();

    await (new Group())
      .useTransaction(this.$trx)
      .fill({
        name: 'NoGroup',
        type: GroupType.NoGroup,
        budgetId: this.id,
      })
      .save();

    await (new Group())
      .useTransaction(this.$trx)
      .fill({
        name: 'Bills',
        type: GroupType.Bills,
        budgetId: this.id,
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
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: food.id,
        name: 'Groceries',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: food.id,
        name: 'Dining Out',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    // No Group Group

    const noGroup = await Group.query({ client: trx })
      .where('budgetId', this.id)
      .andWhere('type', GroupType.NoGroup)
      .firstOrFail();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: noGroup.id,
        name: 'Entertainment',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: noGroup.id,
        name: 'Miscellaneous',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    // Home Improvement Group

    const homeImprovement = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Home Improvement',
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: homeImprovement.id,
        name: 'Maintenance',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: homeImprovement.id,
        name: 'Furniture',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: homeImprovement.id,
        name: 'Other',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    // Health Care Group

    const healthCare = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Health Care',
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: healthCare.id,
        name: 'Medical',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: healthCare.id,
        name: 'Dental',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: healthCare.id,
        name: 'Vision',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    // Insurance Group

    const insurance = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Insurance',
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: insurance.id,
        name: 'Medical',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: insurance.id,
        name: 'Dental',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: insurance.id,
        name: 'Vision',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: insurance.id,
        name: 'House/Car',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    // Bills Group

    const bills = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Bills',
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: bills.id,
        name: 'Electric',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: bills.id,
        name: 'Natural Gas',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: bills.id,
        name: 'Garbage/Recycling',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    // Taxes Group

    const taxes = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Taxes',
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: taxes.id,
        name: 'Federal',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: taxes.id,
        name: 'State',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: taxes.id,
        name: 'Property',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: taxes.id,
        name: 'Preparation Fees',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    // Car Group

    const car = await (new Group())
      .useTransaction(trx)
      .fill({
        name: 'Car',
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: car.id,
        name: 'Gasoline',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: car.id,
        name: 'Maintenance',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: car.id,
        name: 'Registration',
        balanceCents: parseMoneyCents('0.00'),
      })
      .save();
  }

   
  public async getProposedFunding(date: string): Promise<ProposedFundingCategory[]> {
    // Get the first day of the month
    const firstDayOfMonth = DateTime.fromISO(date)
      .set({
        day: 1, hour: 0, minute: 0, second: 0, millisecond: 0,
      })

    const cats = await Category.query()
      .whereHas('group', (query) => {
        query.where('budgetId', this.id)
      })
      .joinRaw(`left outer join
        (
          select transCats."categoryId", sum(transCats.amount) as sum
          from transactions t
          cross join lateral jsonb_to_recordset(t.categories) as transCats("categoryId" int, \
amount decimal)
          where t.date >= ?
          and t.deleted = false
          and t.application_id = ?
          group by transCats."categoryId"
        ) AS T1 on T1."categoryId" = categories.id
      `, [firstDayOfMonth.toISODate() ?? '', this.id]);

    const fundingMonth = firstDayOfMonth.startOf('month');

    const proposedCats: ProposedFundingCategory[] = [];

     
    for (const cat of cats) {
      const proposedCat: ProposedFundingCategory = {
        categoryId: cat.id,
        amount: 0,
        adjusted: false,
        adjustedReason: null,
        fundingCategories: cat.fundingCategories,
        includeFundingTransfers: cat.includeFundingTransfers,
      };

      if (cat.useGoal && cat.goalDate) {
        if (!cat.suspended) {
          let goalMonth = cat.goalDate.startOf('month');

          let monthDiff = goalMonth.diff(fundingMonth, 'months').months;
          if (monthDiff < 0) {
            const numPeriods = Math.ceil(-monthDiff / cat.recurrence);
            monthDiff += numPeriods * cat.recurrence;
            goalMonth = fundingMonth.plus({ months: monthDiff })
          }

          const futureTrxCents = parseMoneyCents(cat.$extras.sum ?? '0.00');
          const goalCents = cat.fundingAmountCents;
          const balanceCents = cat.balanceCents;
          const goalDiffCents = subtractMoneyCents(goalCents,
            subtractMoneyCents(balanceCents, futureTrxCents));
          const monthlyCents = goalDiffCents > 0
            ? moneyCentsFromInteger(Math.round(goalDiffCents / (monthDiff + 1)))
            : parseMoneyCents('0.00');
          proposedCat.amount = Number(formatMoneyCents(monthlyCents));

          const plannedCents = moneyCentsFromInteger(Math.round(goalCents / cat.recurrence));

          if (monthlyCents !== plannedCents) {
            proposedCat.adjusted = true;
            proposedCat.adjustedReason =
              `The funding amount was adjusted from a planned amount of ${formatMoneyCents(
              plannedCents)} to ${formatMoneyCents(monthlyCents)} for the goal of ${Number(
                formatMoneyCents(
                  cat.fundingAmountCents))} due ${goalMonth.month}-${goalMonth.year}.`;
          }
        }
      }
      else {
        proposedCat.amount = Number(formatMoneyCents(cat.fundingAmountCents));
        // const plannedAmount = planCat.amount / planCat.recurrence;
        // let monthlyAmount = plannedAmount;

        // // Adjust the monthly amount if this is a required amount (a bill)
        // // so that there is enough of a balance to meet its requirement
        // if (cat.amount < 0) {
        //   monthlyAmount = plannedAmount - cat.amount

        //   proposedCat.adjusted = true;
         
        // proposedCat.adjustedReason = `The funding amount was adjusted from a planned amount of
        // ${plannedAmount} to ${monthlyAmount}.`
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
    }

    return proposedCats;
  }

   
  public async syncCategoryBalances(this: Budget): Promise<void> {
    const trx = await db.transaction();

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
      logger.error(error);
      await trx.rollback();
    }
  }
}
