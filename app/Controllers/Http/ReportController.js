const Database = use('Database');

class ReportController {
    static async get({ auth }) {
        const query = Database.select(
            Database.raw('date::text'),
            Database.raw('accounts.id || accounts.name AS name'),
            Database.raw('CAST(hist.balance AS float) AS balance'),
        )
            .from('balance_histories AS hist')
            .join('accounts', 'accounts.id', 'hist.account_id')
            .join('institutions', 'institutions.id', 'accounts.institution_id')
            .where('institutions.user_id', auth.user.id)
            .orderBy('date');

        const categoryQuery = Database.select(Database.raw('accounts.id || accounts.name AS name'))
            .from('accounts')
            .join('institutions', 'institutions.id', 'accounts.institution_id')
            .where('institutions.user_id', auth.user.id)
            .orderBy('name');

        const categories = await categoryQuery;

        const crosstab = `SELECT * FROM crosstab('${query.toString()}', '${categoryQuery.toString()}') `
            + `AS (date TEXT ${ReportController.listCategories(categories)})`;

        const data = await Database.raw(crosstab);

        return [['date'].concat(categories)].concat(data.rows.map((item) => Object.values(item)));
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
