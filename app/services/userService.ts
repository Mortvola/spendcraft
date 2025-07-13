import VerifyEmailNotification from "#app/mails/verifyEmailNotification";
import Budget from "#models/Budget";
import User from "#models/User";
import db from "@adonisjs/lucid/services/db";
import mail from '@adonisjs/mail/services/main';

export interface UserDetails {
  username: string,
  email: string,
  password: string,
}

export class UserService {
  public async create(userDetails: UserDetails) {
    const trx = await db.transaction();

    try {
      const budget = await new Budget()
        .useTransaction(trx)
        .save();

      await budget.initialize();

      /**
       * Create a new user
       */
      const user = await budget.related('users').create({
        username: userDetails.username,
        email: userDetails.email,
        password: userDetails.password,
        budgetId: budget.id,
        oneTimePassCode: User.generatePassCode()
      })

      await trx.commit();

      mail.send(new VerifyEmailNotification(user))

      return user;
    }
    catch (error) {
      trx.rollback();
      throw error;
    }
  }
}