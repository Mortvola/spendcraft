/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, HasMany, column, belongsTo, BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import Logger from '@ioc:Adonis/Core/Logger'
import { DateTime } from 'luxon';
import plaidClient, { PlaidTransaction } from '@ioc:Plaid';
import AccountTransaction from 'App/Models/AccountTransaction';
import BalanceHistory from 'App/Models/BalanceHistory';
import Institution from 'App/Models/Institution';
import { AccountType, CategoryBalanceProps, TrackingType } from 'Common/ResponseTypes';
import Transaction from 'App/Models/Transaction';
import Application from 'App/Models/Application';
import { Exception } from '@poppinss/utils';
import { Location } from 'plaid';
import { XMLParser } from 'fast-xml-parser';

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

  @column.dateTime()
  public syncDate: DateTime | null;

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

  public async sync(
    this: Account,
    accessToken: string,
    application: Application,
  ): Promise<AccountSyncResult | null> {
    const result: AccountSyncResult = {
      categories: [],
      accounts: [],
    };

    const trx = this.$trx;
    if (trx === undefined) {
      throw new Error('transaction not defined');
    }

    if (this.tracking !== 'Balances') {
      // Retrieve the past 30 days of transactions
      // (unless the account start date is sooner)
      let startDate: DateTime;

      const newest = await Transaction.query()
        .useTransaction(trx)
        .whereHas('accountTransaction', (query) => {
          query.where('accountId', this.id)
        })
        .orderBy('date', 'desc')
        .first();

      if (newest === null) {
        startDate = DateTime.now().minus({ days: 30 });
      }
      else {
        startDate = newest.date.minus({ days: 14 });
      }

      startDate = DateTime.max(startDate, this.startDate);

      const sum = await this.addTransactions(
        accessToken,
        startDate,
        application,
      );

      this.balance += sum;

      await this.updateAccountBalanceHistory(this.balance);

      const unassigned = await application.getUnassignedCategory({ client: trx });
      result.categories = [{ id: unassigned.id, balance: unassigned.amount }];

      result.accounts = [{
        id: this.id,
        balance: this.balance,
        plaidBalance: this.plaidBalance,
        syncDate: this.syncDate,
      }];
    }
    else {
      await this.updateBalance(accessToken);

      result.accounts = [{
        id: this.id,
        balance: this.balance,
        plaidBalance: this.plaidBalance,
        syncDate: this.syncDate,
      }];
    }

    await this.save();

    return result;
  }

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

    this.syncDate = DateTime.now();
  }

  public async addTransactions(
    this: Account,
    accessToken: string,
    startDate: DateTime,
    application: Application,
  ): Promise<number> {
    // Get the current pending transactions fom the databse. If there
    // are any remaining in this array at the end
    // of the process of adding the plaid transactions then
    // delete them from the database.
    const pendingTransactions = await this.related('accountTransactions')
      .query()
      .where('pending', true)
      .preload('transaction');

    const transactionsResponse = await plaidClient.getTransactions(
      accessToken,
      startDate.toISODate(),
      DateTime.now().toISODate(),
      {
        count: 250,
        offset: 0,
        account_ids: [this.plaidAccountId],
      },
    );

    if (
      transactionsResponse.accounts.length === 1
      && transactionsResponse.accounts[0].account_id !== this.plaidAccountId
    ) {
      // The plaid account ID has changed. Update the account with the new ID
      Logger.info(`Changed plaid account id from ${this.plaidAccountId} to ${transactionsResponse.accounts[0].account_id}`)
      this.plaidAccountId = transactionsResponse.accounts[0].account_id;
    }

    const sum = await this.applyTransactions(application, transactionsResponse.transactions, pendingTransactions);

    this.plaidBalance = transactionsResponse.accounts[0].balances.current;
    if (this.plaidBalance && (this.type === 'credit' || this.type === 'loan')) {
      this.plaidBalance = -this.plaidBalance;
    }

    this.syncDate = DateTime.now();

    return sum;
  }

  // eslint-disable-next-line class-methods-use-this
  public async applyTransactions(
    this: Account,
    application: Application,
    plaidTransactions: PlaidTransaction[],
    pendingTransactions?: AccountTransaction[],
  ): Promise<number> {
    if (!this.$trx) {
      throw new Error('database transaction not set');
    }

    let sum = 0;
    // let pendingSum = 0;

    await Promise.all(plaidTransactions.map(async (plaidTransaction) => {
      if (!this.$trx) {
        throw new Error('database transaction not set');
      }

      if (plaidTransaction.amount !== null) {
        const getLocation = (location: Location) => {
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
              address: plaidTransaction.location.address,
              city: plaidTransaction.location.city,
              region: plaidTransaction.location.region,
              postalCode: plaidTransaction.location.postal_code,
              country: plaidTransaction.location.country,
              lat: plaidTransaction.location.lat,
              lon: plaidTransaction.location.lon,
              storeNumber: plaidTransaction.location.store_number,
            }
          }

          return null;
        }

        // First check to see if the transaction is present. If it is then don't insert it.
        let acctTrans = await AccountTransaction
          .findBy('providerTransactionId', plaidTransaction.transaction_id, { client: this.$trx });

        if (acctTrans) {
          const transaction = await Transaction.findOrFail(acctTrans.transactionId);

          // if the transaction was deleted then do nothing.
          if (!transaction.deleted) {
            // If the existing transaction is pending
            // and the Plaid transaction is still pending then remove
            // the transaction from the pending transaction array (transactions in the
            // pending transaction array will be removed from the database).
            if (pendingTransactions && acctTrans.pending && plaidTransaction.pending) {
              const index = pendingTransactions.findIndex(
                (p) => p.provider === 'PLAID' && p.providerTransactionId === plaidTransaction.transaction_id,
              );

              if (index !== -1) {
                // Transaction is still pending and it was found in the pending transaction
                // array so remove it so it is not deleted from the database.
                pendingTransactions.splice(index, 1);
              }
            }

            // todo: check to see if any of these attributes have changed
            acctTrans.merge({
              name: plaidTransaction.name ?? undefined,
              amount: -plaidTransaction.amount,
              pending: plaidTransaction.pending ?? false,
              paymentChannel: plaidTransaction.payment_channel,
              merchantName: plaidTransaction.merchant_name,
              accountOwner: plaidTransaction.account_owner,
              location: getLocation(plaidTransaction.location),
            });

            await acctTrans.save();

            transaction.merge({
              date: DateTime.fromISO(plaidTransaction.date),
            });

            await transaction.save();
          }
        }
        else {
          const transaction = await (new Transaction())
            .useTransaction(this.$trx)
            .fill({
              date: DateTime.fromISO(plaidTransaction.date),
              applicationId: application.id,
            })
            .save();

          acctTrans = await (new AccountTransaction())
            .useTransaction(this.$trx)
            .fill({
              transactionId: transaction.id,
              provider: 'PLAID',
              providerTransactionId: plaidTransaction.transaction_id,
              accountId: this.id,
              name: plaidTransaction.name ?? undefined,
              amount: -plaidTransaction.amount,
              pending: plaidTransaction.pending ?? false,
              paymentChannel: plaidTransaction.payment_channel,
              merchantName: plaidTransaction.merchant_name,
              accountOwner: plaidTransaction.account_owner,
              location: getLocation(plaidTransaction.location),
            })
            .save();

          if (!plaidTransaction.pending) {
            sum += acctTrans.amount;
          }
        }
      }
    }));

    // Delete any pending transaction in the database that remain in the
    // pending transaction array
    if (pendingTransactions && pendingTransactions.length > 0) {
      await Promise.all(pendingTransactions.map(async (pt): Promise<void> => {
        await pt.delete();
        return pt.transaction.delete();
      }));
    }

    if (sum !== 0 && this.tracking === 'Transactions') {
      const unassigned = await application.getUnassignedCategory({ client: this.$trx });

      unassigned.amount += sum;

      unassigned.save();
    }

    return sum;
  }

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
      await (await this.related('balanceHistory')
        .create({ date: today, balance }))
        .save();
    }
    else if (history.balance !== balance) {
      history.balance = balance;
      await history.save();
    }
  }

  public async processOfx(
    this: Account,
    data: string,
    application: Application,
  ): Promise<void> {
    let sum = 0;

    // Grab the text after the first pair of line feeds.
    const entities = data.toString().split('\n\n');
    let ofxData = entities[1];

    if (ofxData) {
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

      // eslint-disable-next-line no-restricted-syntax
      for (const message of messages) {
        if (/CREDITCARDMSGSRSV.*/.test(message)) {
          const ccStmtTrnResponse = parsed.OFX[message].CCSTMTTRNRS;
          const statement = ccStmtTrnResponse.CCSTMTRS;
          const accountFrom = statement.CCACCTFROM;
          const bankTransList = statement.BANKTRANLIST;
          const transactions = bankTransList.STMTTRN;

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
                  applicationId: application.id,
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
            }
          }
        }
      }
    }

    this.balance += sum;

    if (sum !== 0 && this.tracking === 'Transactions') {
      const unassigned = await application.getUnassignedCategory({ client: this.$trx });

      unassigned.amount += sum;

      unassigned.save();
    }

    await this.updateAccountBalanceHistory(this.balance);

    await this.save();
  }
}

export default Account;
