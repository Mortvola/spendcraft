import React from 'react';
import { observer } from 'mobx-react-lite';
import { DateTime } from 'luxon';
import { useStores } from '../State/Store';
import Bill from './Bill';
import styles from './Overview.module.scss';
import MinorTitle from './MinorTitle';

const Overview = observer(() => {
  const { overview } = useStores()

  return (
    <div className={styles.layout}>
      <div>
        <MinorTitle>Monthly Bills</MinorTitle>
        {
          overview.bills
            .filter((bill) => !bill.category.suspended && bill.date?.month === DateTime.now().month && bill.category.recurrence === 1)
            .map((bill) => (
              <Bill key={bill.id} bill={bill} />
            ))
        }
      </div>

      <div>
        <MinorTitle>Other Bills Due This Month</MinorTitle>
        {
          overview.bills
            .filter((bill) => !bill.category.suspended && bill.date?.month === DateTime.now().month && bill.category.recurrence !== 1)
            .map((bill) => (
              <Bill key={bill.id} bill={bill} />
            ))
        }
      </div>

      <div>
        <MinorTitle>Upcoming Bills</MinorTitle>
        {
          overview.bills
            .filter((bill) => !bill.category.suspended && bill.date?.month !== DateTime.now().month)
            .map((bill) => (
              <Bill key={bill.id} bill={bill} />
            ))
        }
      </div>
    </div>
  )
});

export default Overview;
