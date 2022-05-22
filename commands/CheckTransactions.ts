import { BaseCommand, flags, Exception } from '@adonisjs/core/build/standalone'
import plaidClient from '@ioc:Plaid';
import Account from 'App/Models/Account';
import AccountTransaction from 'App/Models/AccountTransaction';
import User from 'App/Models/User';
import Institution from 'App/Models/Institution';
import {
  TransactionsGetRequestOptions, TransactionsGetResponse, Transaction as PlaidTransaction,
} from 'plaid';
import { DateTime } from 'luxon';
import Database, { TransactionClientContract } from '@ioc:Adonis/Lucid/Database';
import Application from 'App/Models/Application';

type ErrorTransaction = {
  date: string,
  name: string,
  amount: number,
  plaidId: string,
  id: number,
  transaction: AccountTransaction,
  correctAccount: Account | null,
};

type FailedAccount = {
  institution: Institution,
  account: Account,
  missingTransactions: PlaidTransaction[],
  extraTransactions: AccountTransaction[],
  duplicateTransactions: AccountTransaction[],
  accountMismatchTransactions: ErrorTransaction[],
  paymentChannelMismatches: number,
  merchantNameMismatches: number,
}

export default class CheckTransactions extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'check:transactions'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''

  @flags.string({ alias: 'i', description: 'Item ID of the institution to analyze' })
  public item: string

  @flags.boolean({ alias: 'd', description: 'Display all of the details of each plaid transaction' })
  public dump: boolean

  @flags.boolean({ description: 'Adds missing transactions' })
  public fixMissing: boolean;

  @flags.boolean({ description: 'Fixes account mismath' })
  public fixAccountMismatch: boolean;

  @flags.string({ description: 'Updates the specified field' })
  public update: 'paymentChannel' | 'merchantName';

  public static settings = {
    /**
     * Set the following value to true, if you want to load the application
     * before running the command
     */
    loadApp: true,

    /**
     * Set the following value to true, if you want this command to keep running until
     * you manually decide to exit the process
     */
    stayAlive: false,
  }

  private async report (
    user: User,
    application: Application,
    failedAccounts: FailedAccount[],
  ): Promise<void> {
    this.logger.info(user.username);

    // eslint-disable-next-line no-restricted-syntax
    for (const acct of failedAccounts) {
      this.logger.info(`\t${acct.institution.name}, ${acct.account.name}, item id: ${acct.institution.plaidItemId}, account id: ${acct.account.plaidAccountId}`);

      this.logger.info('\t\tMissing Transactions:');
      if (acct.missingTransactions.length > 0) {
        // eslint-disable-next-line no-restricted-syntax
        for (const tran of acct.missingTransactions) {
          this.logger.info(`\t\t\t${tran.date} ${tran.name} ${tran.amount.toFixed(2)} ${tran.transaction_id}`);
          if (this.dump) {
            this.logger.info(JSON.stringify(tran, null, '\t\t\t\t'));
          }

          if (this.fixMissing) {
            // eslint-disable-next-line no-await-in-loop
            const sum = await acct.account.applyTransactions(application, [tran]);

            acct.account.balance += sum;

            // eslint-disable-next-line no-await-in-loop
            await acct.account.save();
          }
        }
      }
      else {
        this.logger.info('\t\t\tNone');
      }

      this.logger.info('\t\tDuplicate Transactions:');
      if (acct.duplicateTransactions.length > 0) {
        // eslint-disable-next-line no-restricted-syntax
        for (const tran of acct.duplicateTransactions) {
          this.logger.info(`\t\t\t${tran.transaction.date.toISODate()} ${tran.name} ${tran.amount.toFixed(2)} ${tran.plaidTransactionId} ${tran.id}`);
        }
      }
      else {
        this.logger.info('\t\t\tNone');
      }

      this.logger.info('\t\tExtra Transactions:');
      if (acct.extraTransactions.length > 0) {
        // eslint-disable-next-line no-restricted-syntax
        for (const tran of acct.extraTransactions) {
          this.logger.info(`\t\t\t${tran.transaction.date.toISODate()} ${tran.name} ${tran.amount.toFixed(2)} ${tran.plaidTransactionId} ${tran.id}`);
        }
      }
      else {
        this.logger.info('\t\t\tNone');
      }

      this.logger.info('\t\tAccount Mismatch Transactions:');
      if (acct.accountMismatchTransactions.length > 0) {
        // eslint-disable-next-line no-restricted-syntax
        for (const tran of acct.accountMismatchTransactions) {
          this.logger.info(`\t\t\t${tran.date} ${tran.name} ${tran.amount.toFixed(2)} ${tran.plaidId} ${tran.id}`);
          this.logger.info(`\t\t\t\t${tran.correctAccount?.plaidAccountId ?? 'unknown'} ${tran.correctAccount?.name ?? 'unknown'}`)
        }
      }
      else {
        this.logger.info('\t\t\tNone');
      }

      this.logger.info(`\t\tPayment Channel Mismatches: ${acct.paymentChannelMismatches}`)
      this.logger.info(`\t\tMerchant Name Mismatches: ${acct.merchantNameMismatches}`)
    }
  }

  private async analyzePlaidTransactions(
    plaidTransactions: PlaidTransaction[],
    trx: TransactionClientContract,
  ) {
    const missingTransactions: PlaidTransaction[] = [];
    let paymentChannelMismatches = 0;
    let merchantNameMismatches = 0;

    // eslint-disable-next-line no-restricted-syntax
    for (const plaidTransaction of plaidTransactions) {
      if (!plaidTransaction.pending) {
        // eslint-disable-next-line no-await-in-loop
        const acctTransaction = await AccountTransaction
          .findBy('plaidTransactionId', plaidTransaction.transaction_id, { client: trx });

        if (acctTransaction === null) {
          missingTransactions.push(plaidTransaction);

          // eslint-disable-next-line no-await-in-loop
          const dupTrans = await AccountTransaction.query()
            .preload('transaction')
            .whereHas('transaction', (query) => {
              query.where('date', plaidTransaction.date)
                .andWhere('pending', false)
                .andWhere('deleted', false);
            })
            .whereHas('account', (query) => {
              query.where('plaidAccountId', plaidTransaction.account_id)
            })
            // .where('plaidAccountId', plaidTransaction.account_id)
            .where('name', plaidTransaction.name)
            .andWhere('amount', plaidTransaction.amount.toFixed(2));

          if (dupTrans.length > 0) {
            console.log('found possible dup:');
            dupTrans.forEach((dt) => {
              console.log(`\t${dt.transaction.date}, ${dt.name}, ${dt.amount.toFixed(2)}`)
            })
          }
        }
        else {
          let updated = false;

          if (plaidTransaction.amount !== null && acctTransaction.amount !== -plaidTransaction.amount) {
            this.logger.error(`Amount mismatch: ${acctTransaction.amount.toFixed(2)} ${-plaidTransaction.amount.toFixed(2)}`);
          }
          else if (plaidTransaction.payment_channel !== acctTransaction.paymentChannel) {
            paymentChannelMismatches += 1;
            if (this.update === 'paymentChannel') {
              acctTransaction.paymentChannel = plaidTransaction.payment_channel;
              updated = true;
            }
          }
          else if (plaidTransaction.merchant_name !== acctTransaction.merchantName) {
            merchantNameMismatches += 1;
            if (this.update === 'merchantName') {
              acctTransaction.merchantName = plaidTransaction.merchant_name ?? null;
              updated = true;
            }
          }

          if (updated) {
            // eslint-disable-next-line no-await-in-loop
            await acctTransaction.save();
          }
        }
      }
    }

    return {
      missingTransactions,
      paymentChannelMismatches,
      merchantNameMismatches,
    }
  }

  private static async analyzeAccountTransactions(
    acct: Account,
    plaidTransactions: PlaidTransaction[],
  ) {
    const extraTransactions: AccountTransaction[] = [];
    const duplicateTransactions: AccountTransaction[] = [];
    const accountMismatchTransactions: ErrorTransaction[] = [];

    // Look for extra transactions
    // eslint-disable-next-line no-await-in-loop
    const acctTransactions = await acct.related('accountTransactions')
      .query()
      .where('pending', false)
      .whereNotNull('plaidTransactionId')
      .preload('transaction', (query) => {
        query.where('deleted', false)
      });

    acctTransactions.sort((a, b) => {
      if (a.transaction.date < b.transaction.date) {
        return 1;
      }

      if (a.transaction.date > b.transaction.date) {
        return -1;
      }

      return 0;
    });

    // eslint-disable-next-line no-await-in-loop
    await Promise.all(acctTransactions.map(async (at) => {
      const plaidTran = plaidTransactions.find((pt) => pt.transaction_id === at.plaidTransactionId);

      if (!plaidTran) {
        const dupTrans = await AccountTransaction.query()
          .whereHas('transaction', (query) => {
            query.where('date', at.transaction.date.toString())
              .andWhere('pending', false)
              .andWhere('deleted', false);
          })
          .where('accountId', at.accountId)
          .andWhere('name', at.name)
          .andWhere('amount', at.amount)
          .andWhere('id', '!=', at.id);

        if (dupTrans.length !== 0) {
          duplicateTransactions.push(at);
        }
        else {
          extraTransactions.push(at);
        }
      }
      else if (acct.plaidAccountId !== plaidTran.account_id) {
        const correctAcct = await Account.findBy('plaidAccountId', plaidTran.account_id);
        accountMismatchTransactions.push({
          date: at.transaction.date.toISODate(),
          name: at.name,
          amount: at.amount,
          plaidId: at.plaidTransactionId,
          id: at.id,
          transaction: at,
          correctAccount: correctAcct,
        });
      }
    }));

    return {
      extraTransactions,
      duplicateTransactions,
      accountMismatchTransactions,
    }
  }

  private async fetchPlaidTransactions(
    inst: Institution,
    acct: Account,
  ): Promise<PlaidTransaction[]> {
    let plaidTransactions: PlaidTransaction[] = [];
    let response: TransactionsGetResponse | null = null;

    do {
      const options: TransactionsGetRequestOptions = {
        account_ids: [acct.plaidAccountId],
        count: 500,
        offset: plaidTransactions.length,
      };

      try {
        const endDate = DateTime.now();

        if (inst.accessToken === null || inst.accessToken === '') {
          throw new Exception(`access token not set for ${inst.plaidItemId}`);
        }

        // eslint-disable-next-line no-await-in-loop
        response = await plaidClient.getTransactions(
          inst.accessToken, acct.startDate.toISODate(), endDate.toISODate(), options,
        );

        // if (response.transactions.length > 0) {
        //   this.logger.info(
        //     `acct: ${acct.name} request id: ${response.request_id} ${response.transactions[0].date} `
        //     + `${response.transactions[response.transactions.length - 1].date} ${JSON.stringify(options)} `
        //     + `${acct.startDate.toISODate()} ${endDate}`,
        //   )
        // }
        // else {
        //   this.logger.info(
        //     `acct: ${acct.name} request id: ${response.request_id} `
        //     + `No transactions ${JSON.stringify(options)}`,
        //   )
        // }

        plaidTransactions = plaidTransactions.concat(response.transactions);
      }
      catch (error) {
        if (error.error_message !== undefined) {
          this.logger.info(`${acct.name}: ${error.error_message}`);
        }
        else {
          this.logger.info(`${acct.name}: ${error.message}`);
        }
      }
    }
    while (response !== null && plaidTransactions.length < response.total_transactions);

    if (response && plaidTransactions.length !== response.total_transactions) {
      this.logger.error(`Mismatch in the number of transactions: ${plaidTransactions.length}, ${response.total_transactions}`);
    }

    return plaidTransactions;
  }

  // eslint-disable-next-line class-methods-use-this
  public async run (): Promise<void> {
    const trx = await Database.transaction();

    const username = await this.prompt.ask('Enter the username', {
      validate(answer) {
        if (!answer) {
          return 'A username is required.';
        }

        return true;
      },
    });

    try {
      const user = await User.findBy('username', username);

      if (!user) {
        throw new Error('Username not found');
      }

      const application = await user.related('application').query().firstOrFail();

      const institutions = await application.related('institutions').query()
        .whereNotNull('plaidItemId')
        .orderBy('name');

      const institutionName = await this.prompt.choice('Select the institution', institutions.map((i) => i.name));

      const inst = institutions.find((i) => i.name === institutionName);

      if (!inst) {
        throw new Error('institution not found');
      }

      const failedAccounts: FailedAccount[] = [];

      // eslint-disable-next-line no-await-in-loop
      const accounts = await inst.related('accounts')
        .query()
        .whereNotNull('plaidAccountId')
        .where('tracking', '!=', 'Balances')
        .orderBy('name');

      const selectedAccounts = await this.prompt.multiple(
        'Select the accounts',
        accounts.map((a) => a.name),
      );

      // eslint-disable-next-line no-restricted-syntax
      for (const acctName of selectedAccounts) {
        const acct = accounts.find((a) => a.name === acctName);

        if (!acct) {
          throw new Error(`account with account name not found: ${acctName}`);
        }

        // eslint-disable-next-line no-await-in-loop
        const plaidTransactions = await this.fetchPlaidTransactions(inst, acct);

        const {
          missingTransactions,
          paymentChannelMismatches,
          merchantNameMismatches,
        // eslint-disable-next-line no-await-in-loop
        } = await this.analyzePlaidTransactions(plaidTransactions, trx);

        const {
          extraTransactions,
          duplicateTransactions,
          accountMismatchTransactions,
        // eslint-disable-next-line no-await-in-loop
        } = await CheckTransactions.analyzeAccountTransactions(acct, plaidTransactions);

        if (
          missingTransactions.length > 0
          || extraTransactions.length > 0
          || duplicateTransactions.length > 0
          || accountMismatchTransactions.length > 0
          || paymentChannelMismatches !== 0
          || merchantNameMismatches !== 0
        ) {
          failedAccounts.push({
            institution: inst,
            account: acct,
            missingTransactions,
            extraTransactions,
            duplicateTransactions,
            accountMismatchTransactions,
            paymentChannelMismatches,
            merchantNameMismatches,
          });

          // // eslint-disable-next-line no-loop-func
          // this.logger.info(`\t\tPlaid statement for ${acct.name}:`)
          // plaidTransactions.forEach((tran) => {
          //   this.logger.info(
          //     `\t\t\t${tran.date} ${tran.name} ${tran.amount} `
          //     + `${tran.transaction_id} ${tran.pending ? 'pending' : ''}`,
          //   )
          // })
        }
      }

      if (failedAccounts.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await this.report(user, application, failedAccounts);

        if (this.fixAccountMismatch) {
          // eslint-disable-next-line no-await-in-loop
          await Promise.all(failedAccounts.map(async (a) => (
            Promise.all(a.accountMismatchTransactions.map(async (t) => {
              if (t.correctAccount) {
                t.transaction.accountId = t.correctAccount.id;

                await t.transaction.save();
              }
            }))
          )));
        }
      }

      if (this.fixMissing || this.fixAccountMismatch || this.update) {
        await trx.commit();
      }
      else {
        await trx.rollback();
      }

      this.logger.info('completed');
    }
    catch (error) {
      this.logger.error(error);
      await trx.rollback();
    }
  }
}
