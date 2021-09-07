import { BaseCommand, flags } from '@adonisjs/core/build/standalone'
import plaidClient from '@ioc:Plaid';
import Account from 'App/Models/Account';
import AccountTransaction from 'App/Models/AccountTransaction';
import User from 'App/Models/User';
import Institution from 'App/Models/Institution';
import {
  TransactionsRequestOptions, TransactionsResponse, Transaction as PlaidTransaction,
} from 'plaid';
import { DateTime } from 'luxon';
import Database from '@ioc:Adonis/Lucid/Database';

export default class CheckTransactions extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'check:transactions'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''

  @flags.string({ alias: 'u', description: 'Name of the user to analyze' })
  public user: string

  @flags.boolean({ alias: 'd', description: 'Display all of the details of each plaid transaction' })
  public dump: boolean

  @flags.boolean({ description: 'Adds missing transactions' })
  public fixMissing: boolean;

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

  // eslint-disable-next-line class-methods-use-this
  public async run (): Promise<void> {
    let users: User[] = [];

    const trx = await Database.transaction();

    if (this.user) {
      users = await User.query({ client: trx }).where('username', this.user);
    }
    else {
      users = await User.query({ client: trx }).orderBy('username', 'asc');
    }

    type FailedAccount = {
      institution: Institution,
      account: Account,
      missingTransactions: PlaidTransaction[],
      extraTransactions: AccountTransaction[],
      paymentChannelMismatches: number,
      merchantNameMismatches: number,
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const user of users) {
      // eslint-disable-next-line no-await-in-loop
      const institutions = await user.related('institutions').query().whereNotNull('plaidItemId');

      const failedAccounts: FailedAccount[] = [];

      // eslint-disable-next-line no-restricted-syntax
      for (const inst of institutions) {
        // eslint-disable-next-line no-await-in-loop
        const accounts = await inst.related('accounts')
          .query()
          .whereNotNull('plaidAccountId')
          .where('tracking', '!=', 'Balances');

        // eslint-disable-next-line no-restricted-syntax
        for (const acct of accounts) {
          let response: TransactionsResponse | null = null;

          const missingTransactions: PlaidTransaction[] = [];
          const extraTransactions: AccountTransaction[] = [];

          let plaidTransactions: PlaidTransaction[] = [];

          let paymentChannelMismatches = 0;
          let merchantNameMismatches = 0;

          do {
            const options: TransactionsRequestOptions = {
              account_ids: [acct.plaidAccountId],
              count: 500,
              offset: plaidTransactions.length,
            };

            try {
              const endDate = DateTime.now();

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

              // eslint-disable-next-line no-restricted-syntax
              for (const plaidTransaction of response.transactions) {
                if (!plaidTransaction.pending) {
                  // eslint-disable-next-line no-await-in-loop
                  const acctTransaction = await AccountTransaction
                    .findBy('plaidTransactionId', plaidTransaction.transaction_id, { client: trx });

                  if (acctTransaction === null) {
                    missingTransactions.push(plaidTransaction);
                  }
                  else {
                    let updated = false;

                    if (plaidTransaction.amount !== null && acctTransaction.amount !== -plaidTransaction.amount) {
                      this.logger.error(`Amount mismatch: ${acctTransaction.amount} ${-plaidTransaction.amount}`);
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
                        acctTransaction.merchantName = plaidTransaction.merchant_name;
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

          // Look for extra transactions
          // eslint-disable-next-line no-await-in-loop
          const acctTransactions = await acct.related('accountTransactions')
            .query()
            .where('pending', false)
            .whereNotNull('plaidTransactionId')
            .preload('transaction');

          acctTransactions.sort((a, b) => {
            if (a.transaction.date < b.transaction.date) {
              return 1;
            }

            if (a.transaction.date > b.transaction.date) {
              return -1;
            }

            return 0;
          });

          acctTransactions.forEach((at) => {
            const plaidTran = plaidTransactions.find((pt) => pt.transaction_id === at.plaidTransactionId);

            if (!plaidTran) {
              extraTransactions.push(at);
            }
          });

          if (
            missingTransactions.length > 0
            || extraTransactions.length > 0
            || paymentChannelMismatches !== 0
            || merchantNameMismatches !== 0
          ) {
            failedAccounts.push({
              institution: inst,
              account: acct,
              missingTransactions,
              extraTransactions,
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
      }

      if (failedAccounts.length > 0) {
        this.logger.info(user.username);

        // eslint-disable-next-line no-restricted-syntax
        for (const acct of failedAccounts) {
          this.logger.info(`\t${acct.institution.name}, ${acct.account.name}, item id: ${acct.institution.plaidItemId}, account id: ${acct.account.plaidAccountId}`);

          this.logger.info('\t\tMissing Transactions:');
          if (acct.missingTransactions.length > 0) {
            // eslint-disable-next-line no-restricted-syntax
            for (const tran of acct.missingTransactions) {
              this.logger.info(`\t\t\t${tran.date} ${tran.name} ${tran.amount} ${tran.transaction_id}`);
              if (this.dump) {
                this.logger.info(JSON.stringify(tran, null, '\t\t\t\t'));
              }

              if (this.fixMissing) {
                // eslint-disable-next-line no-await-in-loop
                const sum = await acct.account.applyTransactions(user, [tran]);

                acct.account.balance += sum;

                // eslint-disable-next-line no-await-in-loop
                await acct.account.save();
              }
            }
          }
          else {
            this.logger.info('\t\t\tNone');
          }

          this.logger.info('\t\tExtra Transactions:');
          if (acct.extraTransactions.length > 0) {
            // eslint-disable-next-line no-restricted-syntax
            for (const tran of acct.extraTransactions) {
              this.logger.info(`\t\t\t${tran.transaction.date.toISODate()} ${tran.name} ${tran.amount} ${tran.plaidTransactionId} ${tran.id}`);
            }
          }
          else {
            this.logger.info('\t\t\tNone');
          }

          this.logger.info(`\t\tPayment Channel Mismatches: ${acct.paymentChannelMismatches}`)
          this.logger.info(`\t\tMerchant Name Mismatches: ${acct.merchantNameMismatches}`)
        }

        if (this.fixMissing || this.update) {
          trx.commit();
        }
      }
    }
  }
}
