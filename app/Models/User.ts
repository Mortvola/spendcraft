import Database from '@ioc:Adonis/Lucid/Database';
import { DateTime } from 'luxon';
import Hash from '@ioc:Adonis/Core/Hash'
import {
  column,
  beforeSave,
  BaseModel,
} from '@ioc:Adonis/Lucid/Orm';

type AccountResult = {
  id: number,
  name: string,
  tracking: string,
  balance: number,
  syncDate: string,
};

type InstitutionResult = {
  id: number,
  name: string,
  accounts: Array<AccountResult>,
};

type MonthBalance = {
  year: number,
  month: number,
  amount: number,
}

export type CategoryHistoryItem = {
  id: number,
  months: Array<MonthBalance>,
};

export type GroupHistoryItem = {
  id: number,
  name: string,
  categories: Array<CategoryHistoryItem>,
};

export default class User extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public username: string;

  @column()
  public email: string

  @column({ serializeAs: null })
  public password: string

  @column()
  public rememberMeToken?: string

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @beforeSave()
  public static async hashPassword(user: User): Promise<void> {
    if (user.$dirty.password) {
      user.password = await Hash.make(user.password);
    }
  }

  public async history(this: User): Promise<Array<GroupHistoryItem>> {
    const data = await Database.query()
      .select(
        Database.raw('EXTRACT(MONTH FROM date) AS month'),
        Database.raw('EXTRACT(YEAR FROM date) AS year'),
        'groups.id AS groupId',
        'groups.name AS groupName',
        'cats.id AS categoryId',
        'cats.name as categoryName',
        Database.raw('CAST(sum(transcats.amount) AS float) AS amount'),
      )
      .from('transaction_categories AS transcats')
      .join('transactions AS trans', 'trans.id', 'transcats.transaction_id')
      .join('categories AS cats', 'cats.id', 'transcats.category_id')
      .join('groups', 'groups.id', 'cats.group_id')
      .where('trans.user_id', this.id)
      .where('groups.id', '!=', -1)
      .whereNotIn('trans.type', [2, 3])
      .groupBy('month', 'year', 'groups.id', 'groups.name', 'cats.id', 'cats.name')
      .orderBy('groups.name')
      .orderBy('cats.name')
      .orderBy('year')
      .orderBy('month');

    const history: Array<GroupHistoryItem> = [];
    let currentGroup: GroupHistoryItem | null = null;
    let currentCategory: CategoryHistoryItem | null = null;

    data.forEach((item) => {
      if (currentGroup === null || item.groupId !== currentGroup.id) {
        history.push({
          id: item.groupId,
          name: item.groupName,
          categories: [],
        });
        currentGroup = history[history.length - 1];
        currentCategory = null;
      }

      if (currentCategory === null || item.categoryId !== currentCategory.id) {
        currentGroup.categories.push({ id: item.categoryId, months: [] });
        currentCategory = currentGroup.categories[currentGroup.categories.length - 1];
      }

      if (currentCategory === null) {
        throw new Error('category is null');
      }

      currentCategory.months.push({
        year: item.year,
        month: item.month,
        amount: item.amount,
      });
    });

    return history;
  }

  public async getConnectedAccounts(this: User): Promise<Array<Record<string, unknown>>> {
    // Check to see if we already have the institution. If not, add it.
    const result = await Database.query()
      .select(
        'inst.id AS institutionId',
        'inst.name AS institutionName',
        'acct.id AS accountId',
        'acct.name AS accountName',
        'acct.tracking AS tracking',
        'acct.balance',
        Database.raw("to_char(acct.sync_date  AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS syncdate"),
      )
      .from('institutions AS inst')
      .leftJoin('accounts AS acct', 'acct.institution_id', 'inst.id')
      .where('inst.user_id', this.id)
      .orderBy('inst.name')
      .orderBy('acct.name');

    const institutions: Array<InstitutionResult> = [];
    let institution: InstitutionResult | null = null;

    result.forEach((acct) => {
      if (!institution) {
        institution = { id: acct.institutionId, name: acct.institutionName, accounts: [] };
      }
      else if (institution.name !== acct.institutionName) {
        institutions.push(institution);
        institution = { id: acct.institutionId, name: acct.institutionName, accounts: [] };
      }

      if (acct.accountId) {
        institution.accounts.push({
          id: acct.accountId,
          name: acct.accountName,
          tracking: acct.tracking,
          balance: acct.balance,
          syncDate: acct.syncdate,
        });
      }
    });

    if (institution) {
      institutions.push(institution);
    }

    return institutions;
  }
}
