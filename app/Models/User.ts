/* eslint-disable import/no-cycle */
import { DateTime } from 'luxon';
import Hash from '@ioc:Adonis/Core/Hash'
import {
  column,
  beforeSave,
  BaseModel,
  belongsTo,
  BelongsTo,
  hasMany,
  HasMany,
} from '@ioc:Adonis/Lucid/Orm';
import { InstitutionProps } from 'Common/ResponseTypes';
import { sha256 } from 'js-sha256';
import * as jwt from 'jsonwebtoken';
import Env from '@ioc:Adonis/Core/Env';
import Mail from '@ioc:Adonis/Addons/Mail';
import { Exception } from '@poppinss/utils';
import Budget from 'App/Models/Budget';
import ApnsToken from './ApnsToken';

type PassCode = {
  code: string,
  expires: DateTime,
}

export default class User extends BaseModel {
  @column({ isPrimary: true, serializeAs: null })
  public id: number

  @column()
  public username: string;

  @column()
  public email: string;

  @column()
  public pendingEmail: string | null;

  @column({ serializeAs: null })
  public password: string

  @column({ serializeAs: null })
  public activated: boolean;

  @column({ serializeAs: null })
  public rememberMeToken?: string

  @column({
    prepare: (value: PassCode) => JSON.stringify(value),
    consume: (value: PassCode | null) => {
      if (value) {
        return {
          code: value.code,
          expires: DateTime.fromISO((value.expires as unknown) as string),
        };
      }

      return null;
    },
  })
  public oneTimePassCode: PassCode | null;

  @column.dateTime({ autoCreate: true, serializeAs: null })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime

  @beforeSave()
  public static async hashPassword(user: User): Promise<void> {
    if (user.$dirty.password) {
      user.password = await Hash.make(user.password);
    }
  }

  @belongsTo(() => Budget)
  public budget: BelongsTo<typeof Budget>;

  @column({ serializeAs: null, columnName: 'application_id' })
  public budgetId: number;

  @hasMany(() => ApnsToken)
  public apnsTokens: HasMany<typeof ApnsToken>

  public async getConnectedAccounts(this: User): Promise<InstitutionProps[]> {
    const budget = await this.related('budget').query().firstOrFail();

    return budget.getConnectedAccounts();
  }

  // eslint-disable-next-line class-methods-use-this
  public generatePassCode(): string {
    const randomNumber = Math.trunc(Math.random() * 1099511627775);

    let value = Math.trunc(randomNumber)
      .toString(32)
      .padStart(8, 'O')
      .split('')
      .map((c) => {
        // Convert from javascript's native base32 conversion to crockford's.
        const v = parseInt(c, 32);
        const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford's alphabet

        return alphabet.charAt(v);
      })
      .join('')

    value = `${value.slice(0, 4)}-${value.slice(4)}`;

    this.oneTimePassCode = { code: value, expires: DateTime.now().plus({ minutes: 5 }) };

    return value;
  }

  public generateToken() : unknown {
    const expiresIn = parseInt(Env.get('TOKEN_EXPIRATION') as string, 10) * 60;
    return jwt.sign(
      { id: this.id, hash: sha256(this.pendingEmail ?? this.email) },
      this.generateSecret(),
      { expiresIn },
    );
  }

  public generateSecret() : string {
    return `${this.password}-${this.createdAt.toMillis()}`;
  }

  public getEmailVerificationLink(): string {
    const token = this.generateToken();

    return `${Env.get('APP_URL') as string}/api/v1/verify-email/${token}/${this.id}`;
  }

  public sendEmailAddressVerification(): void {
    Mail.send((message) => {
      if (this.pendingEmail === null) {
        throw new Exception('user\'s pending email is null');
      }

      message
        .from(Env.get('MAIL_FROM_ADDRESS') as string, Env.get('MAIL_FROM_NAME') as string)
        .to(this.pendingEmail)
        .subject('Please verify your email address.')
        .htmlView('emails/verify-email', {
          name: this.username,
          url: this.getEmailVerificationLink(),
          expires: Env.get('TOKEN_EXPIRATION'),
        });
    });
  }
}
