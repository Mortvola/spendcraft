const Database = use('Database');

class ReportController {
    static async get({ auth }) {
        const query = Database.select(
            Database.raw('date::text'),
            Database.raw("accounts.id || '_' || accounts.name AS name"),
            Database.raw('CAST(hist.balance AS float) AS balance'),
        )
            .from('balance_histories AS hist')
            .join('accounts', 'accounts.id', 'hist.account_id')
            .join('institutions', 'institutions.id', 'accounts.institution_id')
            .where('institutions.user_id', auth.user.id)
            .orderBy('date');

        const categoryQuery = Database.select(Database.raw("accounts.id || '_' || accounts.name AS name"))
            .from('accounts')
            .join('institutions', 'institutions.id', 'accounts.institution_id')
            .where('institutions.user_id', auth.user.id)
            .orderBy('name');

        const categories = await categoryQuery;

        const crosstab = `SELECT * FROM crosstab($$${query.toString()}$$, $$${categoryQuery.toString()}$$) `
            + `AS (date TEXT ${ReportController.listCategories(categories)})`;

        const data = await Database.raw(crosstab);

        // Move the data into the result object
        // Also, strip the account id off of the column names
        const result = [['date'].concat(categories.map((item) => item.name.replace(/\d+_/, '')))]
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

    static listCategories(categories) {
        let cats = '';

        categories.forEach((c) => {
            cats += `, "${c.name}" FLOAT`;
        });

        return cats;
    }
}

module.exports = ReportController
