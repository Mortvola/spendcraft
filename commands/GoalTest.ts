import { CategoryType } from '#common/ResponseTypes';
import { DateTime } from 'luxon';
import { BaseCommand } from "@adonisjs/core/ace";
import { CommandOptions } from "@adonisjs/core/types/ace";

export default class GoalTest extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'goal:test'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''
    static options: CommandOptions = {
          startApp: true,
          staysAlive: false,
        };

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

   
  public async run() {
    const { default: Category } = await import('#models/Category')
    const bills = await Category.query().where('type', CategoryType.Bill);

     
    for (const b of bills) {
      b.$extras.goalDate = GoalTest.getGoalDate(b.goalDate, b.recurrence)
    }

    bills.sort((a, b) => (a.$extras.goalDate ? a.$extras.goalDate.diff(b.$extras.goalDate, 'days').days : 0))

     
    for (const b of bills) {
      console.log(`${b.name}, ${b.fundingAmount}, ${b.balance}, ${b.$extras.goalDate.toISODate()}`)
    }
  }
}
