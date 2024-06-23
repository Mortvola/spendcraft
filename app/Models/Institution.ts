/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, HasMany,
  column,
  belongsTo,
  BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import plaidClient from '@ioc:Plaid';
import * as Plaid from 'plaid';
import Account from 'App/Models/Account';
import Logger from '@ioc:Adonis/Core/Logger'
import Budget from 'App/Models/Budget';
import { DateTime } from 'luxon';
import { CategoryBalanceProps } from 'Common/ResponseTypes';
import AccountTransaction from './AccountTransaction';
import PlaidLog from './PlaidLog';

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

  public async getPlaidInstition(this: Institution): Promise<Plaid.Institution> {
    const response = await plaidClient.getInstitutionById(
      this.institutionId, [Plaid.CountryCode.Us], {
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
      let plaidAccounts: Plaid.AccountBase[] = [];

      const budget = await this.related('budget')
        .query()
        .forUpdate()
        .firstOrFail();

      let accounts = await this.related('accounts').query();

      let nextCursor = this.cursor;

      let unassignedSum = 0;

      let more = true;
      while (more) {
        // eslint-disable-next-line no-await-in-loop
        const response = await plaidClient.syncTransactions(this.accessToken, nextCursor);

        const log = new PlaidLog().useTransaction(trx)
          .fill({
            request: 'syncTransactions',
            response,
          })

        // eslint-disable-next-line no-await-in-loop
        await log.save()

        // If the next_cursor matches the cursor then no new data is available
        if (response.next_cursor !== nextCursor) {
          // eslint-disable-next-line no-restricted-syntax
          for (const account of response.accounts) {
            const index = plaidAccounts.findIndex((pa) => pa.account_id === account.account_id);

            if (index !== -1) {
              // If the account was found in the array then replace it with the
              // new information.
              plaidAccounts = [
                ...plaidAccounts.slice(0, index),
                account,
                ...plaidAccounts.slice(index + 1),
              ]
            }
            else {
              plaidAccounts.push(account)
            }
          }

          // Combine the added and modified transactions into one array
          // so they can be handled in a single loop.
          const transactions = [
            ...response.added,
            ...response.modified,
          ];

          // Process added/modified transactions
          for (let i = 0; i < transactions.length; i += 1) {
            const transaction: Plaid.Transaction = transactions[i];

            // Find account
            // eslint-disable-next-line no-await-in-loop
            let acct = accounts.find((a) => a.$attributes.plaidAccountId === transaction.account_id)

            // If the account was not found then create it and add it to the array of accounts.
            if (!acct) {
              const plaidAccount = plaidAccounts.find((a) => a.account_id === transaction.account_id);

              if (!plaidAccount) {
                throw new Error(`Plaid account ${transaction.account_id} not found.`)
              }

              // eslint-disable-next-line no-await-in-loop
              acct = await Account.firstOrCreate(
                { plaidAccountId: plaidAccount.account_id },
                {
                  plaidAccountId: plaidAccount.account_id,
                  name: plaidAccount.name,
                  officialName: plaidAccount.official_name,
                  mask: plaidAccount.mask,
                  subtype: plaidAccount.subtype ?? '',
                  type: plaidAccount.type,
                  institutionId: this.id,
                  startDate: DateTime.now().startOf('month'),
                  balance: 0,
                  plaidBalance: plaidAccount.balances.current,
                  tracking: 'Transactions',
                  enabled: true,
                  closed: false,
                },
                { client: trx },
              );

              accounts = [
                ...accounts,
                acct,
              ]
            }

            // Only add transactions on or after the starting date.
            // if (DateTime.fromISO(transaction.date) >= acct.startDate) {

            // eslint-disable-next-line no-await-in-loop
            const [amount, unasginedAmount] = await acct.addOrUpdateTransaction(transaction, budget);

            if (!transaction.pending && DateTime.fromISO(transaction.date) >= acct.startDate) {
              acct.$extras.addedSum = (acct.$extras.addedSum ?? 0) + amount;
            }

            if (acct.tracking === 'Transactions') {
              unassignedSum += unasginedAmount;
            }

            acct.$extras.modified = true;
          }

          // Process removed transactions
          for (let i = 0; i < response.removed.length; i += 1) {
            const removed = response.removed[i];

            // eslint-disable-next-line no-await-in-loop
            const at = await AccountTransaction
              .findBy('providerTransactionId', removed.transaction_id, { client: trx });

            if (at) {
              // TODO: assumes removed transactions are pending transactions and therefore
              // have not transaction categories.
              // unassignedSum -= at.amount;

              const acct = accounts.find((a) => a.$attributes.id === at.accountId)

              if (acct) {
                // TODO: assumes removed transactions are pending transactions and therefore
                // have not transaction categories.
                const categoryBalances: CategoryBalanceProps[] = [];

                // eslint-disable-next-line no-await-in-loop
                await acct.deleteAccountTransaction(at, categoryBalances)
              }
              else {
                Logger.info(`removal: account not found: ${at.accountId}`)
              }
            }
            else {
              Logger.info(`removal: transaction not found: ${removed.transaction_id}`)
            }

            // TODO: this code assumes the removed transactions are pending transactions.
            // Add code to update the account balance if the transaction removed is not a pending transaction.
          }
        }

        more = response.has_more;
        nextCursor = response.next_cursor;
      }

      // If we did not get a new next_cursor then that means there was no new data.
      if (nextCursor !== this.cursor) {
        // Update the balance for each account.
        await Promise.all(accounts.map(async (acct) => {
          if (acct.$extras.modified ?? false) {
            const plaidAccount = plaidAccounts.find((a) => a.account_id === acct.plaidAccountId);

            // Only operate on the account if there is a corresponding plaid account.
            if (plaidAccount) {
              acct.plaidBalance = plaidAccount.balances.current;
              if (acct.plaidBalance && (acct.type === 'credit' || acct.type === 'loan')) {
                acct.plaidBalance = -acct.plaidBalance;
              }

              const addedSum = (acct.$extras.addedSum ?? 0);

              if (addedSum !== 0) {
                acct.balance += addedSum
              }

              // eslint-disable-next-line no-await-in-loop
              // await acct.updateStartingBalance(
              //   budget, fundingPool,
              // );

              // eslint-disable-next-line no-await-in-loop
              await acct.save();
            }
          }
        }));

        const unassigned = await budget.getUnassignedCategory({ client: this.$trx });
        unassigned.balance += unassignedSum;
        await unassigned.save();

        this.cursor = nextCursor;
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
