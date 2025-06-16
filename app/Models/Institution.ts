/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany,
  column,
  belongsTo
} from '@adonisjs/lucid/orm';
import plaidClient from '@ioc:Plaid';
import * as Plaid from 'plaid';
import Account from '#app/Models/Account';
import logger from '@adonisjs/core/services/logger'
import Budget from '#app/Models/Budget';
import { DateTime } from 'luxon';
import { HasMany } from "@adonisjs/lucid/types/relations";
import { BelongsTo } from "@adonisjs/lucid/types/relations";

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

  private static async updateAccountBalances(accounts: Account[], plaidAccounts: Plaid.AccountBase[]) {
    return Promise.all(accounts.map(async (acct) => {
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
  }

  private async addOrUpdateTransactions(
    this: Institution,
    budget: Budget,
    transactions: Plaid.Transaction[],
    accounts: Account[],
    plaidAccounts: Plaid.AccountBase[],
  ) {
    let unassignedSum = 0;

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
        acct = await this.related('accounts').firstOrCreate(
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
        );

        accounts.push(acct);
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

    return unassignedSum;
  }

  // eslint-disable-next-line class-methods-use-this
  private async removeTransactions(
    this: Institution,
    removedTransactions: Plaid.RemovedTransaction[],
    accounts: Account[],
  ) {
    for (let i = 0; i < removedTransactions.length; i += 1) {
      const removed = removedTransactions[i];

      const acct = accounts.find((a) => a.plaidAccountId === removed.account_id)

      if (acct) {
        // eslint-disable-next-line no-await-in-loop
        const at = await acct.related('accountTransactions').query()
          .where('providerTransactionId', removed.transaction_id)
          .first();

        if (at) {
          // eslint-disable-next-line no-await-in-loop
          await acct.deleteAccountTransaction(at)
        }
        else {
          logger.info(`removal: transaction not found: ${removed.transaction_id}`)
        }
      }
      else {
        logger.info(`removal: account not found: ${removed.account_id}`)
      }
    }
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

      const accounts = await this.related('accounts').query();

      let nextCursor = this.cursor;

      let unassignedSum = 0;

      let more = true;
      while (more) {
        // eslint-disable-next-line no-await-in-loop
        const response = await plaidClient.syncTransactions(this, nextCursor);

        // If the cursor has change then we received transaction changes.
        if (response.next_cursor !== nextCursor) {
          // Collect the Plaid accounts from the response so we can process them later.
          // eslint-disable-next-line no-restricted-syntax
          for (const plaidAccount of response.accounts) {
            const index = plaidAccounts.findIndex((pa) => pa.account_id === plaidAccount.account_id);

            if (index !== -1) {
              // If the account was found in the array then replace it with the
              // new information.
              plaidAccounts = [
                ...plaidAccounts.slice(0, index),
                plaidAccount,
                ...plaidAccounts.slice(index + 1),
              ]
            }
            else {
              plaidAccounts.push(plaidAccount)
            }
          }

          // Combine the added and modified transactions into one array
          // so they can be handled in a single loop.
          const transactions = [
            ...response.added,
            ...response.modified,
          ];

          // Process added/modified transactions
          // eslint-disable-next-line no-await-in-loop
          unassignedSum += await this.addOrUpdateTransactions(budget, transactions, accounts, plaidAccounts);

          // Process removed transactions
          // eslint-disable-next-line no-await-in-loop
          await this.removeTransactions(response.removed, accounts);
        }

        more = response.has_more;
        nextCursor = response.next_cursor;
      }

      // If the next cursor and the stored cursor are different then
      // we transaction changes. Update account and category balances.
      if (nextCursor !== this.cursor) {
        await Institution.updateAccountBalances(accounts, plaidAccounts);

        const unassigned = await budget.getUnassignedCategory({ client: this.$trx });
        unassigned.balance += unassignedSum;
        await unassigned.save();

        this.cursor = nextCursor;
        this.syncDate = DateTime.now();

        await this.save();
      }
    }
    catch (error) {
      logger.error(error);
      throw error;
    }
  }
}

export default Institution;
