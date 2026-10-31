import {
  addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents, moneyCentsFromInteger,
  type MoneyCents,
} from '#common/moneyCents';
import { encodeMonetaryAmount } from '#services/categoryAmountCodec';
import { requestCategoryStorage } from '#services/categoryStorageBinding';
import { validateStoredCategoryConservation } from '#services/transactionCategoryStorage';
import { validateTransactionSplits } from '#app/validation/transactionSplits';
import { Exception } from '@adonisjs/core/exceptions';
import {
  BaseModel, hasMany, column, belongsTo
} from '@adonisjs/lucid/orm';
import { DateTime } from 'luxon';
import * as Plaid from 'plaid';
import AccountTransaction from '#app/Models/AccountTransaction';
import BalanceHistory from '#app/Models/BalanceHistory';
import Institution from '#app/Models/Institution';
import {
  AccountType, CategoryBalanceProps, GroupType, TrackingType, TransactionType,
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

export interface AccountSyncResult {
  categories: CategoryBalanceProps[],
  accounts: {
    id: number,
    balance: number,
    plaidBalance: number | null,
    syncDate: DateTime | null,
  }[],
}

class Account extends BaseModel {
  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime;

  @column()
  public id: number;

  @column()
  public closed: boolean;

  @hasMany(() => AccountTransaction)
  public accountTransactions: HasMany<typeof AccountTransaction>;

  // Retained only for legacy-row parent-deletion cleanup; no product history lifecycle.
  @hasMany(() => BalanceHistory)
  public balanceHistory: HasMany<typeof BalanceHistory>;

  @hasMany(() => Statement)
  public statements: HasMany<typeof Statement>;

  @column()
  public institutionId: number;

  @column()
  public plaidAccountId: string | null;

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
    consume: (value: string | null) => value === null ? 0 : parseFloat(value),
    serialize: (value: number) => encodeMonetaryAmount(value),
  })
  public balance: number;

  @column({
    consume: (value: string | null) => value === null ? value : parseFloat(value),
    serialize: (value: number | null) => value === null ? null : encodeMonetaryAmount(value),
  })
  public plaidBalance: number | null;

  @column({
    consume: (value: string | null) => value === null ? value : parseFloat(value),
  })
  public rate: number | null;

  @column()
  public enabled: boolean;

  @column()
  public initialized: boolean;

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

  //   if (this.tracking !== TrackingType.Balances) {
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
  // if (this.plaidBalance && (this.type === AccountType.Credit || this.type === AccountType.Loan))
  // {
  //     this.plaidBalance = -this.plaidBalance;
  //   }

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

  // const sum = await this.applyTransactions(budget, transactionsResponse.transactions,
  // pendingTransactions);

  //   this.plaidBalance = transactionsResponse.accounts[0].balances.current;
  // if (this.plaidBalance && (this.type === AccountType.Credit || this.type === AccountType.Loan))
  // {
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
              .select('id', db.raw(
                'json_array_elements(search_strings) #>> \'{}\' as search_string'))
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

      let remainingCents = parseMoneyCents(encodeMonetaryAmount(accountTransaction.amount));
      let percentageBaseCents = remainingCents;

      const assignedCategories: string[] = [];
      transaction.categories = [];

      for (let i = 0; i < categories.length; i += 1) {
        const cat = categories[i];
        let amountCents = cat.percentage
          ? moneyCentsFromInteger(Math.round(percentageBaseCents * (cat.amount / 100)))
          : parseMoneyCents(encodeMonetaryAmount(cat.amount));
        if (!cat.percentage) {
          percentageBaseCents = subtractMoneyCents(percentageBaseCents, amountCents);
        }
        remainingCents = subtractMoneyCents(remainingCents, amountCents);
        // The final rule absorbs the remainder, as before.
        if (remainingCents !== 0 && i === categories.length - 1) {
          amountCents = addMoneyCents(amountCents, remainingCents);
        }
        const amount = Number(formatMoneyCents(amountCents));

        transaction.categories.push({ categoryId: cat.categoryId, amount });

        const category = await Category.findOrFail(cat.categoryId, { client: this.$trx });
        if (transaction.date >= this.startDate) {
          category.balance = Number(formatMoneyCents(addMoneyCents(
            parseMoneyCents(encodeMonetaryAmount(category.balance)), amountCents)));
        }

        await category.save()

         
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
          message: `SpendCraft assigned a transaction for "${accountTransaction
            .name}" to ${assignedCategories.join(', ')}.`,
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
      const newAmount = -plaidTransaction.amount;
      const amountChanged = acctTrans.amount !== newAmount;
      const newDate = DateTime.fromISO(plaidTransaction.date);
      const oldApplicable = transaction.date >= this.startDate;
      const newApplicable = newDate >= this.startDate;
      const oldCategories = transaction.categories.map((category) => ({ ...category }));

      // Replace the old applied effect with the new one. Pending transactions and
      // transactions before the account start date do not affect its balance.
      const oldAppliedAmount = oldApplicable && !acctTrans.pending ? acctTrans.amount : 0;
      const newAppliedAmount = newApplicable && !plaidTransaction.pending ? newAmount : 0;
      transactionAmount = Number(formatMoneyCents(subtractMoneyCents(
        parseMoneyCents(encodeMonetaryAmount(newAppliedAmount)),
        parseMoneyCents(encodeMonetaryAmount(oldAppliedAmount)))));

      // todo: check to see if any of these attributes have changed
      const accountTransactionChanges: ModelObject = {
        providerTransactionId: plaidTransaction.transaction_id,
        name: plaidTransaction.name ?? undefined,
        amount: newAmount,
        pending: plaidTransaction.pending ?? false,
        paymentChannel: plaidTransaction.payment_channel,
        ...(plaidTransaction.merchant_name !== undefined ? { merchantName: plaidTransaction
          .merchant_name } : {}),
        accountOwner: plaidTransaction.account_owner,
        location: Account.getLocation(plaidTransaction.location),
      }

      // Log the changes
      let changes = {};

      changes = getChanges(acctTrans.$attributes, accountTransactionChanges, changes)

      acctTrans.merge(accountTransactionChanges);

      const accountTransactionChanged = acctTrans.$isDirty;
      await acctTrans.save();

      const transactionChanges: ModelObject = {
        date: newDate,
      }

      changes = getChanges(transaction.$attributes, transactionChanges, changes)

      transaction.merge(transactionChanges);

      // If the amount changed then make sure that sum of the transaction
      // categories matches the transaction amount.
      const trxCats = transaction.categories;

      const deltaCents = subtractMoneyCents(
        parseMoneyCents(encodeMonetaryAmount(newAmount)),
        addMoneyCents(...trxCats.map((category) => parseMoneyCents(encodeMonetaryAmount(
          category.amount)))));
      const delta = Number(formatMoneyCents(deltaCents));

      if (delta !== 0) {
        // If there is an unassigned transaction category
        // then adjust its amount. Otherwise, add a new unassigned transaction category.
        const unassigned = await budget.getUnassignedCategory({ client: this.$trx });

        const unnassignedTrxCat = trxCats.find((tc) => tc.categoryId === unassigned.id);

        if (unnassignedTrxCat) {
          unnassignedTrxCat.amount = Number(formatMoneyCents(addMoneyCents(
            parseMoneyCents(encodeMonetaryAmount(unnassignedTrxCat.amount)), deltaCents)));
        }
        else {
          transaction.categories.push({ categoryId: unassigned.id, amount: delta })
        }

        unassignedAmount = newApplicable ? delta : 0;
      }

      if (oldApplicable !== newApplicable && this.tracking === TrackingType.Transactions) {
        // Keep stored allocations, but apply or reverse their balances when
        // crossing the start date. Unassigned is accumulated by the institution.
        const unassigned = await budget.getUnassignedCategory({ client: this.$trx });
        const appliedCategories = newApplicable ? transaction.categories : oldCategories;
        const direction = newApplicable ? 1 : -1;
        unassignedAmount = 0;

        for (const allocation of appliedCategories) {
          const effect = direction * allocation.amount;
          if (allocation.categoryId === unassigned.id) {
            unassignedAmount = Number(formatMoneyCents(addMoneyCents(
              parseMoneyCents(encodeMonetaryAmount(unassignedAmount)),
              parseMoneyCents(encodeMonetaryAmount(effect)))));
          }
          else {
            const category = await Category.findOrFail(allocation.categoryId, { client: this
              .$trx });
            category.balance = Number(formatMoneyCents(addMoneyCents(
              parseMoneyCents(encodeMonetaryAmount(category.balance)),
              parseMoneyCents(encodeMonetaryAmount(effect)))));
            await category.save();
          }
        }
      }

      const allocationsChanged = Object.hasOwn(transaction.$dirty, 'categories');
      if (accountTransactionChanged || transaction.$isDirty) {
        transaction.version += 1;
        await transaction.save();
        if (allocationsChanged || amountChanged) await validateStoredCategoryConservation(
          transaction);

        await transaction.related('transactionLog')
          .create({
            budgetId: transaction.budgetId,
            message: `SpendCraft modified a transaction for "${acctTrans.name}" from "${this
              .name}".`,
            changes,
          });
      }
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

    const transaction = await requestCategoryStorage(new Transaction())
      .useTransaction(this.$trx)
      .fill({
        type: TransactionType.REGULAR_TRANSACTION,
        categories: [],
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

    await validateStoredCategoryConservation(transaction);

    if (transaction.date < this.startDate) {
      return [0, 0];
    }

    return [acctTrans.pending ? 0 : acctTrans.amount, unassignedAmount];
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
      [transactionAmount, unassignedAmount] = await this.updateTransaction(budget, acctTrans,
        plaidTransaction);
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
     
    const transaction = await acctTran.related('transaction').query().firstOrFail();

    if (!transaction.deleted) {
     
      const transCats = transaction.categories;

       
      for (const tc of transCats) {
        if (transaction.date >= this.startDate) {
         
          const category = await Category.findOrFail(tc.categoryId, { client: transaction.$trx });
          category.balance = Number(formatMoneyCents(subtractMoneyCents(
            parseMoneyCents(encodeMonetaryAmount(category.balance)),
            parseMoneyCents(encodeMonetaryAmount(tc.amount)))));
           
          await category.save();
        }
      }

      if (!acctTran.pending && transaction.date >= this.startDate) {
        this.$extras.addedSum = Number(formatMoneyCents(subtractMoneyCents(
          parseMoneyCents(encodeMonetaryAmount(this.$extras.addedSum ?? 0)),
          parseMoneyCents(encodeMonetaryAmount(acctTran.amount)))));
      }

       
      // await acctTran.delete();

       
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
  // const balanceChange = await this.addTransaction(plaidTransaction, budget, pendingTransactions);

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

  //   if (sum !== 0 && this.tracking === TrackingType.Transactions) {
  //     const unassigned = await budget.getUnassignedCategory({ client: this.$trx });

  //     unassigned.amount += sum;

  //     unassigned.save();
  //   }

  //   return sum;
  // }

  public async processOfx(
    this: Account,
    data: string,
    budget: Budget,
    user: User,
  ): Promise<void> {
    if (this.tracking === TrackingType.Balances) {
      throw new Exception('OFX is not supported for balance-tracked accounts', { status: 422 });
    }

    // Grab the text after the first pair of line feeds.
    const entities = data.toString().split('\n\n');
    let ofxData = entities[1];

    if (ofxData) {
      let sum = parseMoneyCents('0.00');
      let providerBalance: number | undefined;

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

      // Preflight the complete upload before mutating financial state. Preserve
      // the parser's existing identifier and numeric normalization.
      const incoming: { date: DateTime, name: string, amount: number, transactionId: string }[] = [
        ];
      for (const message of messages) {
        if (!/CREDITCARDMSGSRSV.*/.test(message)) continue;
        const statement = parsed.OFX[message].CCSTMTTRNRS.CCSTMTRS;
        if (Object.prototype.hasOwnProperty.call(statement, 'LEDGERBAL')) {
          const value: unknown = statement.LEDGERBAL?.BALAMT;
          if ((typeof value !== 'number' && typeof value !== 'string')
            || (typeof value === 'string' && value.trim() === '')
            || !Number.isFinite(Number(value))) {
            throw new Error('Invalid OFX ledger balance');
          }
          providerBalance = Number(value);
        }
        const rows = statement.BANKTRANLIST?.STMTTRN;
        for (const t of rows === undefined ? [] : Array.isArray(rows) ? rows : [rows]) {
          incoming.push({
            date: DateTime.fromFormat(t.DTPOSTED.slice(0, 8), 'yyyyMMdd'),
            name: t.NAME,
            amount: -t.TRNAMT,
            transactionId: `${signOn.SONRS.FI.FID}:${statement.CCACCTFROM.ACCTID}:${t.FITID}`,
          });
        }
      }
      for (const identity of new Set(incoming.map((row) => row.transactionId))) {
        const matches = await this.related('accountTransactions').query()
          .where('providerTransactionId', identity).limit(2);
        if (matches.length > 1) throw new Error('Ambiguous OFX transaction identity');
      }

      const unassigned = await budget.getUnassignedCategory({ client: this.$trx });


      // OFX allocations are complete persisted splits, including an explicit remainder.
      const applyAllocations = async (
        oldAllocations: Transaction['categories'], oldActive: boolean,
        newAllocations: Transaction['categories'], newActive: boolean,
      ) => {
        if (this.tracking !== TrackingType.Transactions) return;
        const deltas = new Map<number, MoneyCents>();
        for (const [allocations, direction] of [[oldActive ? oldAllocations : [], -1], [
          newActive ? newAllocations : [], 1]] as const) {
          for (const allocation of allocations) {
            const previous = deltas.get(allocation.categoryId) ?? parseMoneyCents('0.00');
            const amount = parseMoneyCents(encodeMonetaryAmount(allocation.amount));
            deltas.set(allocation.categoryId, direction === 1
              ? addMoneyCents(previous, amount) : subtractMoneyCents(previous, amount));
          }
        }
        for (const [categoryId, cents] of deltas) {
          if (cents === 0) continue;
          const category = categoryId === unassigned.id ? unassigned : await Category.query({
            client: this.$trx })
            .where('id', categoryId).whereHas('group', (group) => group.where('budgetId', budget
              .id)).firstOrFail();
          category.balance = Number(formatMoneyCents(addMoneyCents(
            parseMoneyCents(encodeMonetaryAmount(category.balance)), cents)));
          await category.save();
        }
      };

      for (const transactionData of incoming) {
        // First check to see if the transaction is present. If it is then don't insert it.

        let acctTrans = await this.related('accountTransactions').query()
          .where('providerTransactionId', transactionData.transactionId)
          .first();

        if (acctTrans) {

          const transaction = await acctTrans.related('transaction').query().firstOrFail();

          const oldAllocations = transaction.categories.map((allocation) => ({ ...allocation }));
          const oldActive = !transaction.deleted && transaction.date >= this.startDate;
          const newAmount = -transactionData.amount;
          const explicit = oldAllocations.filter((allocation) => allocation
            .categoryId !== unassigned.id);
          const remainder = Number(formatMoneyCents(subtractMoneyCents(
            parseMoneyCents(encodeMonetaryAmount(newAmount)),
            addMoneyCents(...explicit.map((allocation) => parseMoneyCents(encodeMonetaryAmount(
              allocation.amount)))))));
          const allocations = [...explicit, { categoryId: unassigned.id, amount: remainder }];
          validateTransactionSplits(newAmount, allocations);
          await applyAllocations(oldAllocations, oldActive, allocations, transactionData
            .date >= this.startDate);

          const oldEffect = !transaction.deleted && !acctTrans.pending && transaction.date >= this
            .startDate
            ? acctTrans.amount : 0;
          const newEffect = !acctTrans.pending && transactionData.date >= this
            .startDate ? newAmount : 0;
          const amount = subtractMoneyCents(parseMoneyCents(encodeMonetaryAmount(newEffect)),
            parseMoneyCents(encodeMonetaryAmount(oldEffect)));

          await transaction
            .merge({
              deleted: false,
              date: transactionData.date,
              categories: allocations,
            })
            .save();


          await acctTrans
            .merge({
              transactionId: transaction.id,
              provider: 'OFX',
              providerTransactionId: transactionData.transactionId,
              name: transactionData.name ?? undefined,
              amount: -transactionData.amount,
            })
            .save();

          await validateStoredCategoryConservation(transaction);
          sum = addMoneyCents(sum, amount);
        }
        else {
          if (!this.$trx) {
            throw new Error('database transaction not set');
          }


          const transaction = await requestCategoryStorage(new Transaction())
            .useTransaction(this.$trx)
            .fill({
              type: TransactionType.REGULAR_TRANSACTION,
              date: transactionData.date,
              budgetId: budget.id,
              categories: [{ categoryId: unassigned.id, amount: -transactionData.amount }],
            })
            .save();


          acctTrans = await this.related('accountTransactions')
            .create({
              transactionId: transaction.id,
              provider: 'OFX',
              providerTransactionId: transactionData.transactionId,
              accountId: this.id,
              name: transactionData.name ?? undefined,
              amount: -transactionData.amount,
            });

          validateTransactionSplits(acctTrans.amount, transaction.categories);
          await validateStoredCategoryConservation(transaction);
          await applyAllocations([], false, transaction.categories, transaction.date >= this
            .startDate);

          if (!acctTrans.pending && transaction.date >= this.startDate) {
            sum = addMoneyCents(sum, parseMoneyCents(encodeMonetaryAmount(acctTrans.amount)));
          }


          await transaction.related('transactionLog')
            .create({
              budgetId: transaction.budgetId,
              message: `${user.username} added a transaction for "${acctTrans.name}" from "${this
                .name}".`,
            });
        }
      }

      this.balance = Number(formatMoneyCents(addMoneyCents(
        parseMoneyCents(encodeMonetaryAmount(this.balance)), sum)));
      if (providerBalance !== undefined) this.plaidBalance = providerBalance;

      await this.save();

      const fundingPool = await budget.getFundingPoolCategory({ client: this.$trx });
      await this.updateStartingBalance(budget, fundingPool);
      await fundingPool.save();
    }
  }

  public async updateStartingBalance(
    this: Account,
    budget: Budget,
    fundingPool: Category,
  ): Promise<void> {
    if (this.tracking === TrackingType.Balances) {
      throw new Exception('Initial Funding is not supported for balance-tracked accounts', {
        status: 422 });
    }

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
    // PostgreSQL SUM(numeric) retains the column's two-decimal scale. Parse its
    // decimal text directly so the aggregate never passes through dollar arithmetic.
    const startingBalanceCents = subtractMoneyCents(
      parseMoneyCents(encodeMonetaryAmount(this.balance)),
      parseMoneyCents(sum?.$extras.sum ?? '0.00'));
    const startingBalance = Number(formatMoneyCents(startingBalanceCents));

    // Get the initial funding record and update the amount
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

      const deltaCents = subtractMoneyCents(
        startingBalanceCents, parseMoneyCents(encodeMonetaryAmount(acctTrx.amount)));
      const delta = Number(formatMoneyCents(deltaCents));

      await acctTrx.merge({
        amount: startingBalance,
      })
        .save();

      transaction.categories[0].amount = acctTrx.amount

      await transaction.save();
      await validateStoredCategoryConservation(transaction);

      if (delta !== 0) {
        logger.info(`Initial funding for account ${this.id} changed by ${delta}`);
      }

      fundingPool.balance = Number(formatMoneyCents(addMoneyCents(
        parseMoneyCents(encodeMonetaryAmount(fundingPool.balance)), deltaCents)));
    }
    else {
      const transaction = await requestCategoryStorage(new Transaction())
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

      await validateStoredCategoryConservation(transaction);
      fundingPool.balance = Number(formatMoneyCents(addMoneyCents(
        parseMoneyCents(encodeMonetaryAmount(fundingPool.balance)), startingBalanceCents)));
    }
  }
}

export default Account;
