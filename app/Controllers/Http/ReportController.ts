import Database from '@ioc:Adonis/Lucid/Database';

type Category = {
  name: string,
};

class ReportController {
  static async get({ auth: { user } }) {
    if (!user) {
      throw new Error('user not defined');
    }

    const query = Database.query()
      .select(
        Database.raw('date::text'),
        Database.raw("accounts.id || '_' || accounts.name AS name"),
        Database.raw('CAST(hist.balance AS float) AS balance'),
      )
      .from('balance_histories AS hist')
      .join('accounts', 'accounts.id', 'hist.account_id')
      .join('institutions', 'institutions.id', 'accounts.institution_id')
      .where('institutions.user_id', user.id)
      .orderBy('date');

    const categoryQuery = Database.query()
      .select(Database.raw("accounts.id || '_' || accounts.name AS name"))
      .from('accounts')
      .join('institutions', 'institutions.id', 'accounts.institution_id')
      .where('institutions.user_id', user.id)
      .orderBy('name');

    const categories: Array<Category> = await categoryQuery;

    const crosstab = `SELECT * FROM crosstab($$${query.toString()}$$, $$${categoryQuery.toString()}$$) `
      + `AS (date TEXT ${ReportController.listCategories(categories)})`;

    const data = await Database.rawQuery(crosstab);

    // Move the data into the result object
    // Also, strip the account id off of the column names
    const result = [['date'].concat(categories
      .map((item) => item.name.replace(/\d+_/, '')))]
      .concat(data.map((item) => Object.values(item)));

    // Fill in any gaps in balances
    for (let j = 1; j < result[1].length; j += 1) {
      if (result[1][j] === null) {
        result[1][j] = '0';
      }
    }

    for (let i = 2; i < result.length; i += 1) {
      for (let j = 1; j < result[i].length; j += 1) {
        if (result[i][j] === null) {
          result[i][j] = result[i - 1][j];
        }
      }
    }

    return result;
  }

  static listCategories(categories: Array<Category>): string {
    let cats = '';

    categories.forEach((c) => {
      cats += `, "${c.name}" FLOAT`;
    });

    return cats;
  }
}

export default ReportController;
