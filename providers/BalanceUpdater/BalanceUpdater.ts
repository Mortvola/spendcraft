import Logger from '@ioc:Adonis/Core/Logger'
import { CronJob } from 'cron';

class BalanceUpdater {
  cronJob: CronJob;

  constructor() {
    this.cronJob = new CronJob('0 21 * * *', () => this.checkBalances());
    this.cronJob.start();
  }

  async checkBalances() {
    try {
      const { default: Institution } = await import("App/Models/Institution");
      const { default: Database } = await import('@ioc:Adonis/Lucid/Database');
      const { default: plaidClient } = await import('@ioc:Plaid');
      const { default: Logger } = await import('@ioc:Adonis/Core/Logger');

      Logger.info('Checking balances');

      const trx = await Database.transaction();

      const institutions = await Institution.query({ client: trx })
        .whereNotNull('accessToken')
        .andWhereHas('accounts', (accountsQuery) => {
          accountsQuery.where('tracking', 'Balances').andWhere('closed', false);
        })
        .preload('accounts', (accountsQuery) => {
          accountsQuery.where('tracking', 'Balances');
        });
     
      await Promise.all(institutions.map(async (institution) => {
        if (institution.accessToken !== null) {
          Logger.info(`Checking accounts at ${institution.name}`);
          const response = await plaidClient.getAccounts(institution.accessToken, {
            account_ids: institution.accounts.map((a) => a.plaidAccountId),
          });
        
          await Promise.all(institution.accounts.map(async (account) => {
            const plaidAccount = response.accounts.find((a) => a.account_id === account.plaidAccountId);
            if (plaidAccount && plaidAccount.balances.current !== null) {
              await account.updateAccountBalanceHistory(plaidAccount.balances.current);
            }
          }))
        }
      }))

      trx.commit();
    }
    catch (error) {
      Logger.error(error, 'balance update failed');
    }
  }
}

export default BalanceUpdater;
