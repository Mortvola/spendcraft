/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, HasMany,
  column,
  belongsTo,
  BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import Database from '@ioc:Adonis/Lucid/Database'
import util from 'util';
import plaidClient, { PlaidInstitution } from '@ioc:Plaid';
import Account from 'App/Models/Account';
import Application from './Application';

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
  public applicationId: number;

  @belongsTo(() => Application)
  public application: BelongsTo<typeof Application>;

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
    removedTransactions: string[],
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
