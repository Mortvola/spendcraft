/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, column, belongsTo
} from '@adonisjs/lucid/orm';
import { DateTime } from 'luxon';
import * as Plaid from 'plaid';
import AccountTransaction from '#app/Models/AccountTransaction';
import BalanceHistory from '#app/Models/BalanceHistory';
import Institution from '#app/Models/Institution';
import {
  type AccountType, CategoryBalanceProps, GroupType, type TrackingType, TransactionType,
} from '#common/ResponseTypes';
import Transaction from '#app/Models/Transaction';
import Budget from '#app/Models/Budget';
import { XMLParser } from 'fast-xml-parser';
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db';
import { getChanges } from '#app/Controllers/Http/transactionFields';
import Category from './Category.js';
import User from './User.js';
import Statement from './Statement.js';
import type { HasMany, BelongsTo } from "@adonisjs/lucid/types/relations";
import { ModelObject } from "@adonisjs/lucid/types/model";

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

  @hasMany(() => Statement)
  public statements: HasMany<typeof Statement>;

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

  // public async updateBalance(
  //   accessToken: string,
  // ): Promise<void> {
  //   const accountsResponse = await plaidClient.getAccounts(accessToken, {
  //     account_ids: [this.plaidAccountId],
  //   });

  //   if (accountsResponse.accounts[0].balances.current === null) {
  //     throw new Exception('Balance is null');
  //   }

  //   this.balance = accountsResponse.accounts[0].balances.current;
  //   this.plaidBalance = accountsResponse.accounts[0].balances.current;
  //   if (this.plaidBalance && (this.type === 'credit' || this.type === 'loan')) {
  //     this.plaidBalance = -this.plaidBalance;
  //   }

  //   await this.updateAccountBalanceHistory(this.balance);
  // }

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
    const unassigned = await budget.getUnassignedCategory({ client: this.$trx });

    transaction.categories = [{ categoryId: unassigned.id, amount: accountTransaction.amount }];

    await transaction.save();

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
              .select('id', db.raw('json_array_elements(search_strings) #>> \'{}\' as search_string'))
              .as('search_strings')
          })
          .select('id')
          .whereRaw('position(lower(search_string) in lower(?)) != 0', [accountTransaction.name])
      })
      .first()

    // TODO: Use the result with the longest search string match.

    if (autoAssignment) {
      // Order by percentage so that the fixed amounts are applied before the percentage amounts
      const categories = await autoAssignment.related('categories').query()
        .orderByRaw('CASE WHEN percentage THEN 1 ELSE 0 END');

      // Multiplying by 100 and rounding to the nearest integer insures we are not
      // working with fractional pennies.
      let remaining = Math.round(accountTransaction.amount * 100);

      const assignedCategories: string[] = [];

      transaction.categories = [];
      let transactionAmount = accountTransaction.amount;

      // eslint-disable-next-line no-restricted-syntax
      for (let i = 0; i < categories.length; i += 1) {
        const cat = categories[i]

        let amount: number;

        if (cat.percentage) {
          amount = Math.round(transactionAmount * (cat.amount / 100.0) * 100);
        }
        else {
          amount = Math.round(cat.amount * 100);
          // Adjust the transaction amount so that any follow any percentage entries
          // are applied against the remainder after fixed amounts are applied.
          transactionAmount -= amount;
        }

        remaining -= amount;

        // If this is the last auto assign category and there is a remaining balance
        // then add it to transaction category about to be created.
        if (remaining !== 0 && i === categories.length - 1) {
          amount += remaining;
        }

        transaction.categories.push({ categoryId: cat.categoryId, amount: amount / 100.0 })

        // Update the category balance
        // eslint-disable-next-line no-await-in-loop
        const category = await Category.findOrFail(cat.categoryId, { client: this.$trx })
        category.balance += amount / 100.0;
        // eslint-disable-next-line no-await-in-loop
        await category.save()

        // eslint-disable-next-line no-await-in-loop
        const group = await category.related('group').query().firstOrFail();

        if (group.type === GroupType.NoGroup) {
          assignedCategories.push(`${category.name}`);
        }
        else {
          assignedCategories.push(`${group.name}:${category.name}`);
        }
      }

      await transaction.save();

      await transaction.related('transactionLog')
        .create({
          budgetId: transaction.budgetId,
          message: `SpendCraft assigned a transaction for "${accountTransaction.name}" to ${assignedCategories.join(', ')}.`,
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
    budget: Budget,
    acctTrans: AccountTransaction,
    plaidTransaction: Plaid.Transaction,
  ): Promise<[number, number]> {
    let transactionAmount = 0;
    let unassignedAmount = 0;

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
      const accountTransactionChanges: ModelObject = {
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
      let changes = {};

      changes = getChanges(acctTrans.$attributes, accountTransactionChanges, changes)

      acctTrans.merge(accountTransactionChanges);

      await acctTrans.save();

      const transactionChanges: ModelObject = {
        date: DateTime.fromISO(plaidTransaction.date),
      }

      changes = getChanges(transaction.$attributes, transactionChanges, changes)

      transactionChanges.version = transaction.version + 1;

      transaction.merge(transactionChanges);

      // If the amount changed then make sure that sum of the transaction
      // categories matches the transaction amount.
      if (accountTransactionChanges.amount) {
        const trxCats = transaction.categories;

        const sum = trxCats.reduce((accum, trxCat) => (
          accum + trxCat.amount
        ), 0)

        const delta = accountTransactionChanges.amount - sum;

        if (delta !== 0) {
          // If there is an unassigned transaction category
          // then adjust its amount. Otherwise, add a new unassigned transaction category.
          const unassigned = await budget.getUnassignedCategory({ client: this.$trx });

          const unnassignedTrxCat = trxCats.find((tc) => tc.categoryId === unassigned.id);

          if (unnassignedTrxCat) {
            unnassignedTrxCat.amount += delta;
          }
          else {
            transaction.categories.push({ categoryId: unassigned.id, amount: delta })
          }

          unassignedAmount = delta;
        }
      }

      await transaction.save();

      await transaction.related('transactionLog')
        .create({
          budgetId: transaction.budgetId,
          message: `SpendCraft modified a transaction for "${acctTrans.name}" from "${this.name}".`,
          changes,
        });
    }

    return [transactionAmount, unassignedAmount];
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

    const transaction = await new Transaction()
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
        budgetId: transaction.budgetId,
        message: `SpendCraft added a transaction for "${acctTrans.name}" from "${this.name}".`,
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
      [transactionAmount, unassignedAmount] = await this.updateTransaction(budget, acctTrans, plaidTransaction);
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
  ) {
    // eslint-disable-next-line no-await-in-loop
    const transaction = await acctTran.related('transaction').query().firstOrFail();

    if (!transaction.deleted) {
    // eslint-disable-next-line no-await-in-loop
      const transCats = transaction.categories;

      // eslint-disable-next-line no-restricted-syntax
      for (const tc of transCats) {
        if (transaction.date >= this.startDate) {
        // eslint-disable-next-line no-await-in-loop
          const category = await Category.findOrFail(tc.categoryId, { client: transaction.$trx });
          category.balance -= tc.amount;
          // eslint-disable-next-line no-await-in-loop
          await category.save();
        }
      }

      if (!acctTran.pending && transaction.date >= this.startDate) {
        this.$extras.addedSum = (this.$extras.addedSum ?? 0) + acctTran.amount;
      }

      // eslint-disable-next-line no-await-in-loop
      // await acctTran.delete();

      // eslint-disable-next-line no-await-in-loop
      // await transaction.delete();

      transaction.merge({
        deleted: true,
      })

      await transaction.save();

      await transaction.related('transactionLog').create({
        budgetId: transaction.budgetId,
        message: `SpendCraft deleted a transaction for "${acctTran.name}" from "${this.name}".`,
      })
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
    user: User,
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
          const ledgerBalance = statement.LEDGERBAL;
          const bankTransList = statement.BANKTRANLIST;
          let transactions = bankTransList.STMTTRN;

          if (!Array.isArray(transactions)) {
            transactions = [transactions]
          }

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
              const transaction = await new Transaction()
                .useTransaction(this.$trx)
                .fill({
                  date: transactionData.date,
                  budgetId: budget.id,
                  categories: [{ categoryId: unassigned.id, amount: -transactionData.amount }],
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

              sum += acctTrans.amount;

              // eslint-disable-next-line no-await-in-loop
              await transaction.related('transactionLog')
                .create({
                  budgetId: transaction.budgetId,
                  message: `${user.username} added a transaction for "${acctTrans.name}" from "${this.name}".`,
                });
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

      await transaction.merge({
        date: this.startDate,
      })
        .save();

      const delta = startingBalance - acctTrx.amount;

      await acctTrx.merge({
        amount: startingBalance,
      })
        .save();

      transaction.categories[0].amount = acctTrx.amount

      await transaction.save();

      if (delta !== 0) {
        logger.info(`Initial funding for account ${this.id} changed by ${delta}`);
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
          categories: [{ categoryId: fundingPool.id, amount: startingBalance }],
        })
        .save();

      await this.related('accountTransactions').create({
        transactionId: transaction.id,
        accountId: this.id,
        name: 'Initial Funding',
        amount: startingBalance,
      });

      fundingPool.balance += startingBalance;
    }
  }
}

export default Account;
