/* eslint-disable import/no-cycle */
import { DateTime } from 'luxon'
import {
  BaseModel, column, HasMany, hasMany, ModelAdapterOptions,
} from '@ioc:Adonis/Lucid/Orm'
import Database from '@ioc:Adonis/Lucid/Database';
import { InstitutionProps, ProposedFundingCateggoryProps, TransactionType } from 'Common/ResponseTypes';
import User from 'App/Models/User'
import Category from 'App/Models/Category';
import Group from 'App/Models/Group';
import FundingPlan from 'App/Models/FundingPlan';
import Institution from 'App/Models/Institution';
import Transaction from 'App/Models/Transaction';
import Loan from 'App/Models/Loan';
import CategoryHistoryItem from 'App/Models/CategoryHistoryItem';

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

  @hasMany(() => FundingPlan)
  public plans: HasMany<typeof FundingPlan>;

  public async history(this: Budget, numberOfMonths: number): Promise<CategoryHistoryItem[]> {
    const startDate = DateTime.now().set({
      hour: 0, minute: 0, second: 0, millisecond: 0,
    });
    const endDate = startDate.minus({ months: numberOfMonths }).set({
      hour: 0, minute: 0, second: 0, millisecond: 0,
    });

    const data = await Database.query()
      .select(
        Database.raw('CAST(EXTRACT(MONTH FROM date) AS integer) AS month'),
        Database.raw('CAST(EXTRACT(YEAR FROM date) AS integer) AS year'),
        'cats.id AS id',
        Database.raw(`CAST(
          sum(
            CASE WHEN trans.type not in (${TransactionType.FUNDING_TRANSACTION}, ${TransactionType.REBALANCE_TRANSACTION}) THEN
              transcats.amount
            ELSE
              0
            END
            ) AS float) AS expenses
        `),
        Database.raw(`CAST(
          sum(
            CASE WHEN trans.type = ${TransactionType.FUNDING_TRANSACTION} THEN
              transcats.amount
            ELSE
              0
            END
            ) AS float) AS funding
        `),
      )
      .from('transaction_categories AS transcats')
      .join('transactions AS trans', 'trans.id', 'transcats.transaction_id')
      .join('categories AS cats', 'cats.id', 'transcats.category_id')
      .where('trans.application_id', this.id)
      .andWhere('trans.date', '>=', endDate.toISODate() ?? '')
      .groupBy('month', 'year', 'cats.id')
      .orderBy('cats.id')
      .orderBy('year', 'desc')
      .orderBy('month', 'desc');

    const history: CategoryHistoryItem[] = [];
    let currentCategory: CategoryHistoryItem | null = null;

    let month = 0;
    let year = 0;

    const decrementMonth = () => {
      month -= 1;

      if (month < 1) {
        year -= 1;
        month = 12;
      }
    }

    data.forEach((category) => {
      if (currentCategory === null || category.id !== currentCategory.id) {
        month = startDate.month;
        year = startDate.year;

        history.push({
          id: category.id,
          months: [],
        });
        currentCategory = history[history.length - 1];
      }

      if (currentCategory === null) {
        throw new Error('category is null');
      }

      while (month !== category.month || year !== category.year) {
        currentCategory.months.push({ expenses: 0, funding: 0 })
        decrementMonth();
      }

      currentCategory.months.push({ expenses: category.expenses, funding: category.funding });
      decrementMonth();
    });

    return history;
  }

  public async getConnectedAccounts(this: Budget): Promise<InstitutionProps[]> {
    const result = await this
      .related('institutions').query()
      .preload('accounts');

    return result.map((i) => ({
      id: i.id,
      name: i.name,
      offline: i.plaidItemId === null,
      accounts: i.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        closed: a.closed,
        type: a.type,
        subtype: a.subtype,
        tracking: a.tracking,
        syncDate: a.syncDate !== null ? a.syncDate.toISO() : null,
        balance: a.balance,
        plaidBalance: a.plaidBalance,
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
        amount: 0,
        groupId: systemGroup.id,
      })
      .save();

    await (new Category()).useTransaction(this.$trx)
      .fill({
        name: 'Funding Pool',
        type: 'FUNDING POOL',
        amount: 0,
        groupId: systemGroup.id,
      })
      .save();

    await (new Category()).useTransaction(this.$trx)
      .fill({
        name: 'Account Transfer',
        type: 'ACCOUNT TRANSFER',
        amount: 0,
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

    await (new FundingPlan()).useTransaction(this.$trx)
      .fill({
        name: 'Default Plan',
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
        system: false,
        budgetId: this.id,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: food.id,
        name: 'Groceries',
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: food.id,
        name: 'Dining Out',
        amount: 0.0,
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
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: noGroup.id,
        name: 'Miscellaneous',
        amount: 0.0,
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
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: homeImprovement.id,
        name: 'Furniture',
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: homeImprovement.id,
        name: 'Other',
        amount: 0.0,
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
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: healthCare.id,
        name: 'Dental',
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: healthCare.id,
        name: 'Vision',
        amount: 0.0,
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
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: insurance.id,
        name: 'Dental',
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: insurance.id,
        name: 'Vision',
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: insurance.id,
        name: 'House/Car',
        amount: 0.0,
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
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: bills.id,
        name: 'Natural Gas',
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: bills.id,
        name: 'Garbage/Recycling',
        amount: 0.0,
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
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: taxes.id,
        name: 'State',
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: taxes.id,
        name: 'Property',
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: taxes.id,
        name: 'Preparation Fees',
        amount: 0.0,
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
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: car.id,
        name: 'Maintenance',
        amount: 0.0,
      })
      .save();

    await (new Category())
      .useTransaction(trx)
      .fill({
        groupId: car.id,
        name: 'Registration',
        amount: 0.0,
      })
      .save();
  }

  // eslint-disable-next-line class-methods-use-this
  public async getProposedFunding(planId: number): Promise<ProposedFundingCateggoryProps[]> {
    const plan = await FundingPlan.findOrFail(planId);

    const cats = await Category.query()
      .whereHas('group', (query) => {
        query.where('budgetId', this.id)
      });

    const fundingCats = await plan.related('categories').query();

    const fundingMonth = DateTime.now().set({
      day: 0, hour: 0, minute: 0, second: 0, millisecond: 0,
    });

    const proposedCats: ProposedFundingCateggoryProps[] = [];

    fundingCats.forEach((planCat) => {
      const proposedCat: ProposedFundingCateggoryProps = {
        categoryId: planCat.categoryId,
        amount: 0,
        expectedToSpend: 0,
        adjusted: false,
        adjustedReason: null,
      };

      const gd = planCat.goalDate?.set({
        day: 0, hour: 0, minute: 0, second: 0, millisecond: 0,
      });

      const cat = cats.find((c) => c.id === planCat.categoryId);

      if (!cat) {
        throw new Error(`Category not found for ${planCat.categoryId}`);
      }

      if (gd) {
        const monthDiff = gd.diff(fundingMonth, 'months').months;

        // TODO: use the planCat.amount sans any transactions this month
        const goalDiff = planCat.amount - cat.amount;

        let monthlyAmount = 0.0;

        if (monthDiff > 0) {
          if (goalDiff > 0) {
            monthlyAmount = goalDiff / (monthDiff + 1)
          }

          proposedCat.amount = monthlyAmount;
        }
        else {
          proposedCat.amount = goalDiff;
          proposedCat.expectedToSpend = planCat.amount;
        }

        const plannedAmount = planCat.amount / planCat.recurrence;

        if (monthlyAmount !== plannedAmount) {
          proposedCat.adjusted = true;
          proposedCat.adjustedReason = `The funding amount was adjusted from a planned amount of ${plannedAmount} to ${monthlyAmount} for the goal of ${planCat.amount} due ${gd.month}-${gd.year}.`;
        }
      }
      else {
        const plannedAmount = planCat.amount / planCat.recurrence;
        let monthlyAmount = plannedAmount;

        // Adjust the monthly amount if this is a required amount (a bill)
        // so that there is enough of a balance to meet its requirement
        if (cat.amount < 0) {
          monthlyAmount = plannedAmount - cat.amount

          proposedCat.adjusted = true;
          proposedCat.adjustedReason = `The funding amount was adjusted from a planned amount of ${plannedAmount} to ${monthlyAmount}.`
        }

        proposedCat.amount = monthlyAmount;

        if (planCat.expectedToSpend !== null) {
          proposedCat.expectedToSpend = planCat.expectedToSpend;
        }
        else {
          const balance = cat.amount + monthlyAmount;
          proposedCat.expectedToSpend = balance > 0 ? balance : 0;
        }
      }

      proposedCats.push(proposedCat)
    })

    return proposedCats;
  }
}
