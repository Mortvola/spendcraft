/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, HasMany,
  column,
  belongsTo,
  BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import plaidClient, { PlaidInstitution } from '@ioc:Plaid';
import Account from 'App/Models/Account';
import Logger from '@ioc:Adonis/Core/Logger'
import Application from 'App/Models/Application';
import { CountryCode } from 'plaid';

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

  @hasMany(() => Account)
  public accounts: HasMany<typeof Account>;

  @column()
  public applicationId: number;

  @belongsTo(() => Application)
  public application: BelongsTo<typeof Application>;

  public async removeTransactions(
    removedTransactions: string[],
  ): Promise<void> {
    Logger.info(`Removing transactions from ${this.id}: ${removedTransactions}`);
  }

  public async getPlaidInstition(this: Institution): Promise<PlaidInstitution> {
    const response = await plaidClient.getInstitutionById(
      this.institutionId, [CountryCode.Us], {
        include_optional_metadata: true,
        include_status: true,
      },
    );

    return response.institution;
  }
}

export default Institution;
