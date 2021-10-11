/* eslint-disable import/no-cycle */
import { DateTime } from 'luxon';
import Hash from '@ioc:Adonis/Core/Hash'
import {
  column,
  beforeSave,
  BaseModel,
  belongsTo,
  BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import { InstitutionProps } from 'Common/ResponseTypes';
import { sha256 } from 'js-sha256';
import jwt from 'jsonwebtoken';
import Env from '@ioc:Adonis/Core/Env';
import Mail from '@ioc:Adonis/Addons/Mail';
import { Exception } from '@poppinss/utils';
import Application from 'App/Models/Application';

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

  @belongsTo(() => Application)
  public application: BelongsTo<typeof Application>;

  @column({ serializeAs: null })
  public applicationId: number;

  public async getConnectedAccounts(this: User): Promise<InstitutionProps[]> {
    const application = await this.related('application').query().firstOrFail();

    return application.getConnectedAccounts();
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

    return `${Env.get('APP_URL') as string}/verify-email/${token}/${this.id}`;
  }

  public getPasswordResetLink(): string {
    const token = this.generateToken();

    return `${Env.get('APP_URL') as string}/password/reset/${token}/${this.id}`;
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
