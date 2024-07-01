/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, HasMany, column, belongsTo, BelongsTo,
  ModelAttributes,
} from '@ioc:Adonis/Lucid/Orm';
import { DateTime } from 'luxon';
import plaidClient from '@ioc:Plaid';
import * as Plaid from 'plaid';
import AccountTransaction from 'App/Models/AccountTransaction';
import BalanceHistory from 'App/Models/BalanceHistory';
import Institution from 'App/Models/Institution';
import {
  AccountType, CategoryBalanceProps, TrackingType, TransactionType,
} from 'Common/ResponseTypes';
import Transaction from 'App/Models/Transaction';
import Budget from 'App/Models/Budget';
import { Exception } from '@poppinss/utils';
import { XMLParser } from 'fast-xml-parser';
import Logger from '@ioc:Adonis/Core/Logger'
import Database from '@ioc:Adonis/Lucid/Database';
import Category from './Category';
import TransactionCategory from './TransactionCategory';

export type AccountSyncResult = {
  categories: CategoryBalanceProps[],
  accounts: {
    id: number,
    balance: number,
    plaidBalance: number | null,
    syncDate: DateTime | null,
  }[],
};

class Account extends BaseModel {
  @column()
  public id: number;

  @column()
  public closed: boolean;

  @hasMany(() => AccountTransaction)
  public accountTransactions: HasMany<typeof AccountTransaction>;

  @hasMany(() => BalanceHistory)
  public balanceHistory: HasMany<typeof BalanceHistory>;

  @column()
  public institutionId: number;

  @column()
  public plaidAccountId: string;

  @column()
  public name: string;

  @column()
  public officialName: string | null;

  @column()
  public mask: string | null;

  @column()
  public subtype: string;

  @column()
  public type: AccountType;

  @column()
  public tracking: TrackingType;

  @column.date()
  public startDate: DateTime;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public balance: number;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public plaidBalance: number | null;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public rate: number | null;

  @column()
  public enabled: boolean;

  @belongsTo(() => Institution)
  public institution: BelongsTo<typeof Institution>;

  // public async sync(
  //   this: Account,
  //   accessToken: string,
  //   budget: Budget,
  // ): Promise<AccountSyncResult | null> {
  //   const result: AccountSyncResult = {
  //     categories: [],
  //     accounts: [],
  //   };

  //   const trx = this.$trx;
  //   if (trx === undefined) {
  //     throw new Error('transaction not defined');
  //   }

  //   if (this.tracking !== 'Balances') {
  //     // Retrieve the past 30 days of transactions
  //     // (unless the account start date is sooner)
  //     let startDate: DateTime;

  //     const newest = await Transaction.query()
  //       .useTransaction(trx)
  //       .whereHas('accountTransaction', (query) => {
  //         query.where('accountId', this.id)
  //       })
  //       .orderBy('date', 'desc')
  //       .first();

  //     if (newest === null) {
  //       startDate = DateTime.now().minus({ days: 30 });
  //     }
  //     else {
  //       startDate = newest.date.minus({ days: 14 });
  //     }

  //     startDate = DateTime.max(startDate, this.startDate);

  //     const sum = await this.addTransactions(
  //       accessToken,
  //       startDate,
  //       budget,
  //     );

  //     this.balance += sum;

  //     await this.updateAccountBalanceHistory(this.balance);

  //     const unassigned = await budget.getUnassignedCategory({ client: trx });
  //     result.categories = [{ id: unassigned.id, balance: unassigned.amount }];

  //     result.accounts = [{
  //       id: this.id,
  //       balance: this.balance,
  //       plaidBalance: this.plaidBalance,
  //       syncDate: this.syncDate,
  //     }];
  //   }
  //   else {
  //     await this.updateBalance(accessToken);

  //     result.accounts = [{
  //       id: this.id,
  //       balance: this.balance,
  //       plaidBalance: this.plaidBalance,
  //       syncDate: this.syncDate,
  //     }];
  //   }

  //   await this.save();

  //   return result;
  // }

  public async updateBalance(
    accessToken: string,
  ): Promise<void> {
    const accountsResponse = await plaidClient.getAccounts(accessToken, {
      account_ids: [this.plaidAccountId],
    });

    if (accountsResponse.accounts[0].balances.current === null) {
      throw new Exception('Balance is null');
    }

    this.balance = accountsResponse.accounts[0].balances.current;
    this.plaidBalance = accountsResponse.accounts[0].balances.current;
    if (this.plaidBalance && (this.type === 'credit' || this.type === 'loan')) {
      this.plaidBalance = -this.plaidBalance;
    }

    await this.updateAccountBalanceHistory(this.balance);
  }

  // public async addTransactions(
  //   this: Account,
  //   accessToken: string,
  //   startDate: DateTime,
  //   budget: Budget,
  // ): Promise<number> {
  //   // Get the current pending transactions fom the databse. If there
  //   // are any remaining in this array at the end
  //   // of the process of adding the plaid transactions then
  //   // delete them from the database.
  //   const pendingTransactions = await this.related('accountTransactions')
  //     .query()
  //     .where('pending', true)
  //     .preload('transaction');

  //   const transactionsResponse = await plaidClient.getTransactions(
  //     accessToken,
  //     startDate.toISODate() ?? '',
  //     DateTime.now().toISODate() ?? '',
  //     {
  //       count: 250,
  //       offset: 0,
  //       account_ids: [this.plaidAccountId],
  //     },
  //   );

  //   if (
  //     transactionsResponse.accounts.length === 1
  //     && transactionsResponse.accounts[0].account_id !== this.plaidAccountId
  //   ) {
  //     // The plaid account ID has changed. Update the account with the new ID
  //     Logger.info(`Changed plaid account id from ${this.plaidAccountId}
  // to ${transactionsResponse.accounts[0].account_id}`)
  //     this.plaidAccountId = transactionsResponse.accounts[0].account_id;
  //   }

  //   const sum = await this.applyTransactions(budget, transactionsResponse.transactions, pendingTransactions);

  //   this.plaidBalance = transactionsResponse.accounts[0].balances.current;
  //   if (this.plaidBalance && (this.type === 'credit' || this.type === 'loan')) {
  //     this.plaidBalance = -this.plaidBalance;
  //   }

  //   this.syncDate = DateTime.now();

  //   return sum;
  // }

  private async assignUnassigned(
    budget: Budget,
    transaction: Transaction,
    accountTransaction: AccountTransaction,
  ): Promise<number> {
    // The pending account transaction was not found. Create an unassigned transaction category
    // for the new transaction.
    const unassigned = await budget.getUnassignedCategory({ client: this.$trx });

    await transaction.related('transactionCategories').create({
      categoryId: unassigned.id,
      amount: accountTransaction.amount,
    });

    return accountTransaction.amount;
  }

  // eslint-disable-next-line class-methods-use-this
  private async autoAssign(
    this: Account,
    budget: Budget,
    transaction: Transaction,
    accountTransaction: AccountTransaction,
  ): Promise<boolean> {
    const autoAssignment = await budget.related('autoAssignment').query()
      .whereIn('id', (q) => {
        q
          .from((sub) => {
            sub
              .from('auto_assignments')
              .select('id', Database.raw('json_array_elements(search_strings) #>> \'{}\' as search_string'))
              .as('search_strings')
          })
          .select('id')
          .whereRaw('position(lower(search_string) in lower(?)) != 0', [accountTransaction.name])
      })
      .first()

    // TODO: Use the result with the longest search string match.

    if (autoAssignment) {
      const categories = await autoAssignment.related('categories').query();

      // Multiplying by 100 and rounding to the nearest integer insures we are not
      // working with fractional pennies.
      let remaining = Math.round(accountTransaction.amount * 100);

      const assignedCategories: string[] = [];

      // eslint-disable-next-line no-restricted-syntax
      for (let i = 0; i < categories.length; i += 1) {
        const cat = categories[i]

        let amount = Math.round(accountTransaction.amount * (cat.amount / 100.0) * 100);
        remaining -= amount;

        // If this is the last auto assign category and there is a remaining balance
        // then add it to transaction category about to be created.
        if (remaining !== 0 && i === categories.length - 1) {
          amount += remaining;
        }

        // eslint-disable-next-line no-await-in-loop
        await transaction.related('transactionCategories').create({
          categoryId: cat.categoryId,
          amount: amount / 100.0,
        });

        // Update the category balance
        // eslint-disable-next-line no-await-in-loop
        const category = await Category.findOrFail(cat.categoryId, { client: this.$trx })

        category.merge({
          balance: category.balance + amount / 100.0,
        })

        category.save()

        // eslint-disable-next-line no-await-in-loop
        const group = await category.related('group').query().firstOrFail();

        if (group.type === 'NO GROUP') {
          assignedCategories.push(`${category.name}`);
        }
        else {
          assignedCategories.push(`${group.name}:${category.name}`);
        }
      }

      await transaction.related('transactionLog')
        .create({
          message: `SpendCraft assigned a transaction for "${accountTransaction.name}" to ${assignedCategories.join(', ')}.`,
          transactionId: transaction.id,
        })

      return true;
    }

    // Did not find an auto assignment matching entry
    return false;
  }

  private static getLocation(location: Plaid.Location) {
    if (location.address !== null
      || location.city !== null
      || location.country !== null
      || location.lat !== null
      || location.lon !== null
      || location.postal_code !== null
      || location.region !== null
      || location.store_number !== null
    ) {
      return {
        address: location.address,
        city: location.city,
        region: location.region,
        postalCode: location.postal_code,
        country: location.country,
        lat: location.lat,
        lon: location.lon,
        storeNumber: location.store_number,
      }
    }

    return null;
  }

  private async updateTransaction(
    this: Account,
    acctTrans: AccountTransaction,
    plaidTransaction: Plaid.Transaction,
  ): Promise<number> {
    let transactionAmount = 0;

    const transaction = await acctTrans.related('transaction').query()
      .firstOrFail()

    // if the transaction was deleted then do nothing.
    // TODO: Even if the transaction was deleted update the information.
    if (!transaction.deleted) {
      // If the transaction is changing from pending to not pending then
      // return the transaction amount so the account balance can be updated correctly.
      if (acctTrans.pending && !plaidTransaction.pending) {
        transactionAmount = -plaidTransaction.amount;
      }

      // todo: check to see if any of these attributes have changed
      const newValues: Partial<ModelAttributes<typeof acctTrans>> = {
        providerTransactionId: plaidTransaction.transaction_id,
        name: plaidTransaction.name ?? undefined,
        amount: -plaidTransaction.amount,
        pending: plaidTransaction.pending ?? false,
        paymentChannel: plaidTransaction.payment_channel,
        merchantName: plaidTransaction.merchant_name,
        accountOwner: plaidTransaction.account_owner,
        location: Account.getLocation(plaidTransaction.location),
      }

      // Log the changes
      const changes = {};

      Object.keys(newValues).forEach((k) => {
        if (newValues[k] !== acctTrans[k]) {
          changes[k] = { old: acctTrans[k], new: newValues[k] }
        }
      })

      Logger.info(`Changes: ${JSON.stringify(changes)}`)

      acctTrans.merge(newValues);

      await acctTrans.save();

      transaction.merge({
        date: DateTime.fromISO(plaidTransaction.date),
        version: transaction.version + 1,
      });

      await transaction.save();

      await transaction.related('transactionLog')
        .create({
          message: `SpendCraft modified a transaction for "${acctTrans.name}" from "${this.name}".`,
          transactionId: transaction.id,
        });
    }

    return transactionAmount;
  }

  private async addTransaction(
    this: Account,
    budget: Budget,
    plaidTransaction: Plaid.Transaction,
  ): Promise<[number, number]> {
    if (!this.$trx) {
      throw new Error('database transaction not set');
    }

    let unassignedAmount = 0;

    const transaction = await (new Transaction())
      .useTransaction(this.$trx)
      .fill({
        date: DateTime.fromISO(plaidTransaction.date),
        budgetId: budget.id,
      })
      .save();

    const acctTrans = await this.related('accountTransactions').create({
      transactionId: transaction.id,
      provider: 'PLAID',
      providerTransactionId: plaidTransaction.transaction_id,
      name: plaidTransaction.name ?? undefined,
      amount: -plaidTransaction.amount,
      pending: plaidTransaction.pending ?? false,
      paymentChannel: plaidTransaction.payment_channel,
      merchantName: plaidTransaction.merchant_name,
      accountOwner: plaidTransaction.account_owner,
      location: Account.getLocation(plaidTransaction.location),
    });

    await transaction.related('transactionLog')
      .create({
        message: `SpendCraft added a transaction for "${acctTrans.name}" from "${this.name}".`,
        transactionId: transaction.id,
      });

    // If this is a matching auto assignment then use its categories
    // Otherwise, assign the unassigned category.
    if (!(await this.autoAssign(budget, transaction, acctTrans))) {
      unassignedAmount = await this.assignUnassigned(budget, transaction, acctTrans);
    }

    return [acctTrans.amount, unassignedAmount];
  }

  public async addOrUpdateTransaction(
    this: Account,
    plaidTransaction: Plaid.Transaction,
    budget: Budget,
  ): Promise<[number, number]> {
    if (!this.$trx) {
      throw new Error('database transaction not set');
    }

    let transactionAmount = 0;
    let unassignedAmount = 0;

    // First check to see if the transaction is present. If it is then update it. If it is not
    // then add it.
    let acctTrans: AccountTransaction | null = null;

    // Get the corresponding account transaction, if there is one.
    acctTrans = await this.related('accountTransactions').query()
      .where('providerTransactionId', plaidTransaction.transaction_id)
      .first();

    // If a corresponding account transaction was not found but there
    // is a pending transaction id and the corresponding transaction
    // is found then use that.
    if (!acctTrans && plaidTransaction.pending_transaction_id) {
      acctTrans = await this.related('accountTransactions').query()
        .where('providerTransactionId', plaidTransaction.pending_transaction_id)
        .first()
    }

    if (acctTrans) {
      // The account transaction exists. Update it.
      transactionAmount = await this.updateTransaction(acctTrans, plaidTransaction);
    }
    else {
      // Tthe acdount transaction was not found. Create it.
      [transactionAmount, unassignedAmount] = await this.addTransaction(budget, plaidTransaction);
    }

    return [transactionAmount, unassignedAmount];
  }

  public async deleteAccountTransaction(
    this: Account,
    acctTran: AccountTransaction,
    categoryBalances: CategoryBalanceProps[],
  ) {
    // eslint-disable-next-line no-await-in-loop
    const transaction = await Transaction.find(acctTran.transactionId, { client: acctTran.$trx });

    if (transaction) {
      // eslint-disable-next-line no-await-in-loop
      const transCats = await TransactionCategory
        .query({ client: acctTran.$trx })
        .where('transactionId', transaction.id);

      // eslint-disable-next-line no-restricted-syntax
      for (const tc of transCats) {
        if (!acctTran.pending && this.tracking === 'Transactions' && transaction.date >= this.startDate) {
          // eslint-disable-next-line no-await-in-loop
          const category = await Category.find(tc.categoryId, { client: acctTran.$trx });

          if (category) {
            category.balance -= tc.amount;

            // eslint-disable-next-line no-await-in-loop
            await category.save();

            const catBalance = categoryBalances.find((cb) => cb.id === category.id);

            if (catBalance) {
              catBalance.balance = category.balance;
            }
            else {
              categoryBalances.push({ id: category.id, balance: category.balance })
            }
          }
        }

        // eslint-disable-next-line no-await-in-loop
        await tc.delete();
      }

      // eslint-disable-next-line no-await-in-loop
      await acctTran.delete();

      // eslint-disable-next-line no-await-in-loop
      await transaction.delete();
    }
    else {
      Logger.info(`deleteAccountTransaction: transaction not found: ${acctTran.transactionId}`)
    }
  }

  // eslint-disable-next-line class-methods-use-this
  // public async applyTransactions(
  //   this: Account,
  //   budget: Budget,
  //   plaidTransactions: PlaidTransaction[],
  //   pendingTransactions?: AccountTransaction[],
  // ): Promise<number> {
  //   if (!this.$trx) {
  //     throw new Error('database transaction not set');
  //   }

  //   let sum = 0;
  //   // let pendingSum = 0;

  //   await Promise.all(plaidTransactions.map(async (plaidTransaction) => {
  //     const balanceChange = await this.addTransaction(plaidTransaction, budget, pendingTransactions);

  //     sum += balanceChange
  //   }));

  //   // Delete any pending transaction in the database that remain in the
  //   // pending transaction array
  //   if (pendingTransactions && pendingTransactions.length > 0) {
  //     await Promise.all(pendingTransactions.map(async (pt): Promise<void> => {
  //       await pt.delete();
  //       return pt.transaction.delete();
  //     }));
  //   }

  //   if (sum !== 0 && this.tracking === 'Transactions') {
  //     const unassigned = await budget.getUnassignedCategory({ client: this.$trx });

  //     unassigned.amount += sum;

  //     unassigned.save();
  //   }

  //   return sum;
  // }

  public async updateAccountBalanceHistory(
    this: Account,
    balance: number,
  ): Promise<void> {
    const today = DateTime.utc();

    const history = await this.related('balanceHistory')
      .query()
      .where('date', today.toFormat('yyyy-MM-dd'))
      .first();

    // If the history record was not found then create one.
    // Otherwise, update the one that was found (if the balance has
    // changed).
    if (history === null) {
      await this.related('balanceHistory')
        .create({ date: today, balance });
    }
    else if (history.balance !== balance) {
      history.balance = balance;
      await history.save();
    }
  }

  public async processOfx(
    this: Account,
    data: string,
    budget: Budget,
  ): Promise<void> {
    // Grab the text after the first pair of line feeds.
    const entities = data.toString().split('\n\n');
    let ofxData = entities[1];

    if (ofxData) {
      let sum = 0;
      let balance: number | null = null;

      const sgml2Xml = (sgml: string) => (
        sgml
          .replace(/>\s+</g, '><') // remove whitespace inbetween tag close/open
          .replace(/\s+</g, '<') // remove whitespace before a close tag
          .replace(/>\s+/g, '>') // remove whitespace after a close tag
        // eslint-disable-next-line no-useless-escape
          .replace(/<([A-Z0-9_]*)+\.+([A-Z0-9_]*)>([^<]+)/g, '<\$1\$2>\$3')
        // eslint-disable-next-line no-useless-escape
          .replace(/<(\w+?)>([^<]+)/g, '<\$1>\$2</\$1>')
      );

      ofxData = sgml2Xml(ofxData);

      const parser = new XMLParser();
      const parsed = parser.parse(ofxData);

      const messages = Object.keys(parsed.OFX).filter((key) => /.*MSGSRSV.*/.test(key));

      const signOnMessage = messages.find((m) => /SIGNONMSGSRSV.*/.test(m));

      if (!signOnMessage) {
        throw Error('SignOn not found');
      }

      const signOn = parsed.OFX[signOnMessage];

      const unassigned = await budget.getUnassignedCategory({ client: this.$trx });

      // eslint-disable-next-line no-restricted-syntax
      for (const message of messages) {
        if (/CREDITCARDMSGSRSV.*/.test(message)) {
          const ccStmtTrnResponse = parsed.OFX[message].CCSTMTTRNRS;
          const statement = ccStmtTrnResponse.CCSTMTRS;
          const accountFrom = statement.CCACCTFROM;
          const bankTransList = statement.BANKTRANLIST;
          const transactions = bankTransList.STMTTRN;
          const ccStmtRs = ccStmtTrnResponse.CCSTMTRS;
          const ledgerBalance = ccStmtRs.LEDGERBAL;
          balance = ledgerBalance.BALAMT;

          // eslint-disable-next-line no-restricted-syntax
          for (const t of transactions) {
            const transactionData: {
              date: DateTime,
              name: string,
              amount: number,
              transactionId: string,
            } = {
              date: DateTime.fromFormat(t.DTPOSTED.slice(0, 8), 'yyyyMMdd'),
              name: t.NAME,
              amount: -t.TRNAMT,
              transactionId: `${signOn.SONRS.FI.FID}:${accountFrom.ACCTID}:${t.FITID}`,
            }

            // First check to see if the transaction is present. If it is then don't insert it.
            // eslint-disable-next-line no-await-in-loop
            let acctTrans = await this.related('accountTransactions').query()
              .where('providerTransactionId', transactionData.transactionId)
              .first();

            if (acctTrans) {
              // eslint-disable-next-line no-await-in-loop
              const transaction = await acctTrans.related('transaction').query().firstOrFail();

              // The amount to add to the balance is the difference between
              // the old transaction amount and the new transaction amount unless
              // the transaction was previously deleted. In that case, the amount
              // is the amount of the new transaction.
              let amount = -transactionData.amount - acctTrans.amount;

              if (transaction.deleted) {
                amount = -transactionData.amount;
              }

              // eslint-disable-next-line no-await-in-loop
              await transaction
                .merge({
                  deleted: false,
                  date: transactionData.date,
                })
                .save();

              // eslint-disable-next-line no-await-in-loop
              await acctTrans
                .merge({
                  transactionId: transaction.id,
                  provider: 'OFX',
                  providerTransactionId: transactionData.transactionId,
                  name: transactionData.name ?? undefined,
                  amount: -transactionData.amount,
                })
                .save();

              sum += amount;
            }
            else {
              if (!this.$trx) {
                throw new Error('database transaction not set');
              }

              // eslint-disable-next-line no-await-in-loop
              const transaction = await (new Transaction())
                .useTransaction(this.$trx)
                .fill({
                  date: transactionData.date,
                  budgetId: budget.id,
                })
                .save();

              // eslint-disable-next-line no-await-in-loop
              acctTrans = await this.related('accountTransactions')
                .create({
                  transactionId: transaction.id,
                  provider: 'OFX',
                  providerTransactionId: transactionData.transactionId,
                  accountId: this.id,
                  name: transactionData.name ?? undefined,
                  amount: -transactionData.amount,
                });

              // eslint-disable-next-line no-await-in-loop
              await transaction.related('transactionCategories').create({
                categoryId: unassigned.id,
                amount: -transactionData.amount,
              });

              sum += acctTrans.amount;
            }
          }
        }
      }

      if (balance !== null) {
        this.balance = balance;
      }
      else {
        this.balance += sum;
      }

      if (sum !== 0 && this.tracking === 'Transactions') {
        unassigned.balance += sum;

        await unassigned.save();
      }

      await this.updateAccountBalanceHistory(this.balance);

      await this.save();

      const fundingPool = await budget.getFundingPoolCategory({ client: this.$trx });
      await this.updateStartingBalance(budget, fundingPool);
    }
  }

  public async updateStartingBalance(
    this: Account,
    budget: Budget,
    fundingPool: Category,
  ): Promise<void> {
    if (!this.$trx) {
      throw new Error('database transaction not set');
    }

    const startDate = this.startDate.toISODate();

    if (!startDate) {
      throw new Error('startDate is null');
    }

    // Sum the transactions from the initial funding date to the most recent
    // (except for deleted and pending transactions)
    const sum = await this.related('accountTransactions').query()
      .whereHas('transaction', (q) => {
        q.where('date', '>=', startDate)
          .andWhere('type', '!=', TransactionType.STARTING_BALANCE)
          .andWhere('deleted', false)
      })
      .where('pending', false)
      .sum('amount')
      .first();

    // The initial funding is the current balance minus the sum
    const startingBalance = this.balance - (sum?.$extras.sum ?? 0);

    // Get the initial funding record and update the amont
    // or add the initial funding if one was not found.
    const acctTrx = await this.related('accountTransactions').query()
      .whereHas('transaction', (q) => {
        q.where('type', TransactionType.STARTING_BALANCE)
      })
      .first();

    if (acctTrx) {
      const transaction = await acctTrx.related('transaction').query().firstOrFail();

      const transactionCategory = await transaction.related('transactionCategories').query().firstOrFail();

      await transaction.merge({
        date: this.startDate,
      })
        .save();

      const delta = startingBalance - acctTrx.amount;

      await acctTrx.merge({
        amount: startingBalance,
      })
        .save();

      await transactionCategory.merge({
        amount: acctTrx.amount,
      })
        .save();

      if (delta !== 0) {
        Logger.info(`Initial funding for account ${this.id} changed by ${delta}`);
      }

      fundingPool.balance += delta;
    }
    else {
      const transaction = await (new Transaction())
        .useTransaction(this.$trx)
        .fill({
          date: this.startDate,
          sortOrder: -1,
          budgetId: budget.id,
          type: TransactionType.STARTING_BALANCE,
        })
        .save();

      await this.related('accountTransactions').create({
        transactionId: transaction.id,
        accountId: this.id,
        name: 'Initial Funding',
        amount: startingBalance,
      });

      await transaction.related('transactionCategories').create({
        transactionId: transaction.id,
        categoryId: fundingPool.id,
        amount: startingBalance,
      })

      fundingPool.balance += startingBalance;
    }
  }
}

export default Account;
