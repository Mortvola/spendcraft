/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, HasMany,
  column,
  belongsTo,
  BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import plaidClient, { PlaidInstitution, PlaidTransaction } from '@ioc:Plaid';
import Account from 'App/Models/Account';
import Logger from '@ioc:Adonis/Core/Logger'
import Budget from 'App/Models/Budget';
import { CountryCode, TransactionsSyncResponse } from 'plaid';
import Database from '@ioc:Adonis/Lucid/Database';
import { TransactionType } from 'Common/ResponseTypes';
import { DateTime } from 'luxon';

class Institution extends BaseModel {
  @column()
  public id: number;

  @column()
  public institutionId: string;

  @column()
  public name: string;

  @column({
    serializeAs: null,
  })
  public accessToken: string | null;

  @column()
  public plaidItemId: string | null;

  @column()
  public cursor: string | null;

  @hasMany(() => Account)
  public accounts: HasMany<typeof Account>;

  @column({ serializeAs: null, columnName: 'application_id' })
  public budgetId: number;

  @belongsTo(() => Budget)
  public budget: BelongsTo<typeof Budget>;

  public async removeTransactions(
    removedTransactions: string[],
  ): Promise<void> {
    Logger.info(`Removing transactions from ${this.id}: ${removedTransactions}`);
  }

  public async getPlaidInstition(this: Institution): Promise<PlaidInstitution> {
    const response = await plaidClient.getInstitutionById(
      this.institutionId, [CountryCode.Us], {
        include_optional_metadata: true,
        include_status: true,
      },
    );

    return response.institution;
  }

  public async syncUpdate(this: Institution): Promise<void> {
    if (this.accessToken === null) {
      throw new Error('access token is null');
    }

    const trx = await Database.transaction();

    this.useTransaction(trx);

    try {
      const plaidAccounts = await plaidClient.getAccounts(this.accessToken);

      const budget = await this.related('budget').query().firstOrFail();

      const accounts = await this.related('accounts').query()
        .withCount('accountTransactions', (query) => {
          query.as('hasStartingBalance').whereHas('transaction', (q2) => {
            q2.where('type', TransactionType.STARTING_BALANCE)
          })
        });

      let more = true;
      while (more) {
        // eslint-disable-next-line no-await-in-loop
        const response = await plaidClient.syncTransactions(this.accessToken, this.cursor ?? '');

        for (let i = 0; i < response.added.length; i += 1) {
          const added: PlaidTransaction = response.added[i];

          // Find account
          // eslint-disable-next-line no-await-in-loop
          const acct = accounts.find((a) => a.$attributes.plaidAccountId === added.account_id)

          // Only add transactions on or after the starting date.
          if (acct && DateTime.fromISO(added.date) >= acct.startDate) {
            // eslint-disable-next-line no-await-in-loop
            const amount = await acct.addTransaction(added, budget);

            if (!added.pending) {
              acct.$extras.addedSum = (acct.$extras.addedSum ?? 0) + amount;
            }
          }
        }

        for (let i = 0; i < response.modified.length; i += 1) {
          const modified: PlaidTransaction = response.modified[i];

          // Find account
          // eslint-disable-next-line no-await-in-loop
          const acct = accounts.find((a) => a.$attributes.plaidAccountId === modified.account_id)

          if (acct) {
            // eslint-disable-next-line no-await-in-loop
            // await acct.addTransaction(modified, budget);
          }
        }

        for (let i = 0; i < response.removed.length; i += 1) {
          const removed = response.removed[i];
        }

        more = response.has_more;
        this.cursor = response.next_cursor;
      }

      const fundingPool = await budget.getFundingPoolCategory({ client: this.$trx });

      // Update the balance for each account.
      for (let i = 0; i < accounts.length; i += 1) {
        const acct = accounts[i];

        acct.plaidBalance = plaidAccounts.accounts[0].balances.current;
        if (acct.plaidBalance && (acct.type === 'credit' || acct.type === 'loan')) {
          acct.plaidBalance = -acct.plaidBalance;
        }

        // TODO: Move the sync date to the institution.
        acct.syncDate = DateTime.now();

        // Add a starting balance record to the accounts that don't have one.
        // Otherwise, adjust the balance.
        if (parseInt(acct.$extras.hasStartingBalance, 10) === 0) {
          acct.balance = acct.plaidBalance ?? 0;

          // eslint-disable-next-line no-await-in-loop
          await acct.insertStartingBalance(
            budget, acct.balance - acct.$extras.addedSum, fundingPool,
          );
        }
        else {
          acct.balance += acct.$extras.addedSum;
        }

        // eslint-disable-next-line no-await-in-loop
        await acct.save();
      }

      await this.save();

      await trx.commit();
    }
    catch (error) {
      Logger.error(error);
      await trx.rollback();
    }
  }
}

export default Institution;
