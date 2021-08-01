/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, HasMany,
  column,
  belongsTo,
  BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import Env from '@ioc:Adonis/Core/Env'
import Database, { TransactionClientContract } from '@ioc:Adonis/Lucid/Database'
import util from 'util';
import plaidClient, { PlaidInstitution } from '@ioc:Plaid';
import Account from 'App/Models/Account';
import User from 'App/Models/User';

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
  public accessToken: string;

  @column()
  public plaidItemId: string;

  @hasMany(() => Account)
  public accounts: HasMany<typeof Account>;

  @column()
  public userId: number;

  @belongsTo(() => User)
  public user: BelongsTo<typeof User>;

  public static async updateWebhooks(): Promise<void> {
    const hook = Env.get('PLAID_WEBHOOK');

    if (hook) {
      console.log(`Updating webhooks to '${hook}'`);

      if (hook) {
        const result = await Database.query()
          .select('inst.access_token AS accessToken')
          .from('institutions AS inst');

        result.forEach((item) => {
          console.log(`updating ${item.accessToken}`);
          plaidClient.updateItemWebhook(item.accessToken, hook, (error, response) => {
            console.log(`error: ${error}, response: ${JSON.stringify(response)}`);
          });
        });
      }
    }
  }

  public static async updateItemIds(): Promise<void> {
    const getItem = util.promisify(plaidClient.getItem).bind(plaidClient);

    const result = await Database.query().select(
      'id',
      'inst.access_token AS accessToken',
    )
      .from('institutions AS inst')
      .whereNull('plaid_item_id');

    if (result.length > 0) {
      await Promise.all(result.map(async (item) => {
        try {
          const { item: { item_id: itemId } } = await getItem(item.accessToken);
          await Database.from('institutions').where('id', item.id).update('plaid_item_id', itemId);
        }
        catch (error) {
          console.log(JSON.stringify(error));
        }
      }));
    }
  }

  public async removeTransactions(
    _trx: TransactionClientContract,
    removedTransactions,
  ): Promise<void> {
    console.log(`Removing transactions from ${this.id}: ${removedTransactions}`);
  }

  public async getPlaidInstition(this: Institution): Promise<PlaidInstitution> {
    const response = await plaidClient.getInstitutionById(
      this.institutionId, ['US'], {
        include_optional_metadata: true,
        include_status: true,
      },
    );

    return response.institution;
  }
}

export default Institution;
