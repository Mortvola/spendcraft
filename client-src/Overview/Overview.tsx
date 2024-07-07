import React from 'react';
import { observer } from 'mobx-react-lite';
import { DateTime } from 'luxon';
import { useStores } from '../State/Store';
import Bill from './Bill';
import styles from './Overview.module.scss';

const Overview = observer(() => {
  const { overview } = useStores()

  return (
    <div className={styles.layout}>
      <div>
        <div>Monthly Bills</div>
        {
          overview.bills
            .filter((bill) => bill.date?.month === DateTime.now().month && bill.recurrence === 1)
            .map((bill) => (
              <Bill key={bill.id} bill={bill} />
            ))
        }
      </div>

      <div>
        <div>Other Bills Due This Month</div>
        {
          overview.bills
            .filter((bill) => bill.date?.month === DateTime.now().month && bill.recurrence !== 1)
            .map((bill) => (
              <Bill key={bill.id} bill={bill} />
            ))
        }
      </div>

      <div>
        <div>Upcoming Bills</div>
        {
          overview.bills
            .filter((bill) => bill.date?.month !== DateTime.now().month)
            .map((bill) => (
              <Bill key={bill.id} bill={bill} />
            ))
        }
      </div>
    </div>
  )
});

export default Overview;
