import Database from '@ioc:Adonis/Lucid/Database';

type Category = {
  name: string,
};

class ReportController {
  // eslint-disable-next-line class-methods-use-this
  public async get({ auth: { user } }) {
    if (!user) {
      throw new Error('user not defined');
    }

    const query = 'select date::text, accounts.id || \'_\' || accounts.name AS name, CAST(hist.balance AS float) AS balance '
      + 'from balance_histories AS hist '
      + 'join accounts ON accounts.id = hist.account_id '
      + 'join institutions ON institutions.id = accounts.institution_id '
      + `where institutions.user_id = ${user.id} `
      + 'order by date';

    const categoryQuery = 'select accounts.id || \'_\' || accounts.name AS name '
      + 'from accounts '
      + 'join institutions ON institutions.id = accounts.institution_id '
      + `where institutions.user_id = ${user.id} `
      + 'order by name';

    const categories = await Database.rawQuery(categoryQuery);

    const crosstab = `SELECT * FROM crosstab($$${query}$$, $$${categoryQuery}$$) `
      + `AS (date TEXT ${ReportController.listCategories(categories.rows)})`;

    const data = await Database.rawQuery(crosstab);

    // Move the data into the result object
    // Also, strip the account id off of the column names
    const result: Array<Array<string | number>> = [['date'].concat(categories.rows
      .map((item) => item.name.replace(/\d+_/, '')))]
      .concat(data.rows.map((item) => Object.values(item)));

    // Fill in any gaps in balances
    for (let j = 1; j < result[1].length; j += 1) {
      if (result[1][j] === null) {
        result[1][j] = 0;
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
