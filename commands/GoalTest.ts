import { BaseCommand } from '@adonisjs/core/build/standalone'
import { DateTime } from 'luxon';

export default class GoalTest extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'goal:test'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''

  public static settings = {
    /**
     * Set the following value to true, if you want to load the application
     * before running the command. Don't forget to call `node ace generate:manifest` 
     * afterwards.
     */
    loadApp: true,

    /**
     * Set the following value to true, if you want this command to keep running until
     * you manually decide to exit the process. Don't forget to call 
     * `node ace generate:manifest` afterwards.
     */
    stayAlive: false,
  }

  static getGoalDate(goalDate?: DateTime | null, recurrence = 1): DateTime | null {
    if (goalDate) {
      let adjustedGoal = goalDate
      const now = DateTime.now().startOf('month');

      const monthDiff = goalDate.startOf('month').diff(now, 'months').months;
      if (monthDiff < 0) {
        const numPeriods = Math.ceil(-monthDiff / recurrence);
        adjustedGoal = goalDate.plus({ months: numPeriods * recurrence })
      }

      // console.log(adjustedGoal.toISODate() ?? '');

      // let goalMonth = goalDate.startOf('month');

      // const monthDiff2 = goalMonth.diff(now, 'months').months;
      // if (monthDiff2 < 0) {
      //   const numPeriods = Math.ceil(-monthDiff2 / recurrence);
      //   // monthDiff2 += numPeriods * recurrence;
      //   goalMonth = goalDate.plus({ months: numPeriods * recurrence })
      // }

      // console.log(goalMonth.toISODate() ?? '');

      return adjustedGoal; // .toISODate() ?? '';
    }

    return null;
  }

  // eslint-disable-next-line class-methods-use-this
  public async run() {
    const { default: Category } = await import('App/Models/Category')
    const bills = await Category.query().where('type', 'BILL');

    // eslint-disable-next-line no-restricted-syntax
    for (const b of bills) {
      b.$extras.goalDate = GoalTest.getGoalDate(b.goalDate, b.recurrence)
    }

    bills.sort((a, b) => (a.$extras.goalDate ? a.$extras.goalDate.diff(b.$extras.goalDate, 'days').days : 0))

    // eslint-disable-next-line no-restricted-syntax
    for (const b of bills) {
      console.log(`${b.name}, ${b.fundingAmount}, ${b.balance}, ${b.$extras.goalDate.toISODate()}`)
    }
  }
}
