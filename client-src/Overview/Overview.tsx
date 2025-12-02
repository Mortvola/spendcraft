import React from 'react';
import { observer } from 'mobx-react-lite';
import { DateTime } from 'luxon';
import { useStores } from '../State/Store';
import Bill from './Bill';
import styles from './Overview.module.scss';
import MinorTitle from './MinorTitle';

const Overview: React.FC = observer(() => {
  const { overview } = useStores()

  const otherBills = overview.bills
    .filter((bill) => {
      const computedGoalDate = bill.category.computedGoalDate()

      return (
        computedGoalDate && !bill.category.suspended
        && computedGoalDate.month === DateTime.now().month
        && computedGoalDate.year === DateTime.now().year
        && bill.category.recurrence !== 1
      )
    })


  return (
    <div className={styles.layout}>
      <div>
        <MinorTitle>Monthly Bills</MinorTitle>
        {
          overview.bills
            .filter((bill) => (
              !bill.category.suspended
              && bill.category.computedGoalDate()?.month === DateTime.now().month
              && bill.category.recurrence === 1)
            )
            .map((bill) => (
              <Bill key={bill.category.id} bill={bill} />
            ))
        }
      </div>

      {
        otherBills.length > 0
          ? (
            <div>
              <MinorTitle>Other Bills Due This Month</MinorTitle>
              {
                otherBills.map((bill) => (
                  <Bill key={bill.category.id} bill={bill} />
                ))
              }
            </div>
          )
          : null
      }

      <div>
        <MinorTitle>Upcoming Bills</MinorTitle>
        {
          overview.bills
            .filter((bill) => (
              !bill.category.suspended
              && bill.category.computedGoalDate()?.month !== DateTime.now().month)
            )
            .map((bill) => (
              <Bill key={bill.category.id} bill={bill} />
            ))
        }
      </div>
    </div>
  )
});

export default Overview;
