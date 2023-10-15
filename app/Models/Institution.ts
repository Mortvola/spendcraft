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
import { CountryCode } from 'plaid';
import { TransactionType } from 'Common/ResponseTypes';
import { DateTime } from 'luxon';
import AccountTransaction from './AccountTransaction';
import StagedTransaction from './StagedTransaction';

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

  @column.dateTime()
  public syncDate: DateTime | null;

  @hasMany(() => Account)
  public accounts: HasMany<typeof Account>;

  @column({ serializeAs: null, columnName: 'application_id' })
  public budgetId: number;

  @belongsTo(() => Budget)
  public budget: BelongsTo<typeof Budget>;

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

    const trx = this.$trx;
    if (trx === undefined) {
      throw new Error('transaction not defined');
    }

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

        Logger.info(`sync transactions: added: ${response.added.length}, modified: ${response.modified.length}, removed: ${response.removed.length}`);

        // Combine the added and modified transactions into one array
        // so they can be handled in a single loop.
        const transactions = [
          ...response.added,
          ...response.modified,
        ]

        // If the next_cursor is null or empty then the initial data is not ready yet.
        if ((response.next_cursor ?? '') !== '') {
          for (let i = 0; i < transactions.length; i += 1) {
            const transaction: PlaidTransaction = transactions[i];

            // Find account
            // eslint-disable-next-line no-await-in-loop
            const acct = accounts.find((a) => a.$attributes.plaidAccountId === transaction.account_id)

            if (acct) {
              // Only add transactions on or after the starting date.
              if (DateTime.fromISO(transaction.date) >= acct.startDate) {
                // eslint-disable-next-line no-await-in-loop
                const amount = await acct.addTransaction(transaction, budget);

                if (!transaction.pending) {
                  acct.$extras.addedSum = (acct.$extras.addedSum ?? 0) + amount;
                }
              }
            }
            else {
              // The account was not found. Add the transaction to the staged
              // transactions table
              // eslint-disable-next-line no-await-in-loop
              await (new StagedTransaction()).useTransaction(trx).fill({
                institutionId: this.id,
                plaidAccountId: transaction.account_id,
                transaction,
              })
                .save();
            }
          }

          for (let i = 0; i < response.removed.length; i += 1) {
            const removed = response.removed[i];

            // eslint-disable-next-line no-await-in-loop
            const at = await AccountTransaction.findBy('providerTransactionId', removed.transaction_id);

            if (at) {
              at.useTransaction(trx);

              // eslint-disable-next-line no-await-in-loop
              const t = await at.related('transaction').query().first();

              at.delete();

              if (t) {
                t.delete();
              }
            }

            // TODO: this code assumes the removed transactions are pending transactions.
            // Add code to update the account balance if the transaction removed is not a pending transaction.
          }
        }

        more = response.has_more;
        this.cursor = response.next_cursor;
      }

      // If we did not get a next_cursor then that means the data wasn't ready yet.
      // When it is ready we should receive a webhook.
      if ((this.cursor ?? '') !== '') {
        const fundingPool = await budget.getFundingPoolCategory({ client: this.$trx });

        // Update the balance for each account.
        await Promise.all(accounts.map(async (acct) => {
          const plaidAccount = plaidAccounts.accounts.find((a) => a.account_id === acct.plaidAccountId);

          // Only operator on the account if there is a corresponding plaid account.
          if (plaidAccount) {
            acct.plaidBalance = plaidAccount.balances.current;
            if (acct.plaidBalance && (acct.type === 'credit' || acct.type === 'loan')) {
              acct.plaidBalance = -acct.plaidBalance;
            }

            // Add a starting balance record to the accounts that don't have one.
            // Otherwise, adjust the balance.
            if (parseInt(acct.$extras.hasStartingBalance, 10) === 0) {
              acct.balance = acct.plaidBalance ?? 0;

              // eslint-disable-next-line no-await-in-loop
              await acct.insertStartingBalance(
                budget, acct.balance - (acct.$extras.addedSum ?? 0), fundingPool,
              );
            }
            else {
              acct.balance += acct.$extras.addedSum ?? 0;
            }

            if ((acct.$extras.addedSum ?? 0) !== 0 && acct.tracking === 'Transactions') {
              const unassigned = await budget.getUnassignedCategory({ client: this.$trx });

              unassigned.amount += (acct.$extras.addedSum ?? 0);

              unassigned.save();
            }
          }

          // eslint-disable-next-line no-await-in-loop
          await acct.save();
        }));

        this.syncDate = DateTime.now();

        await this.save();
      }
    }
    catch (error) {
      Logger.error(error);
      throw error;
    }
  }
}

export default Institution;
