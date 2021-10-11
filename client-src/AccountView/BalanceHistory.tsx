import React, { useContext, useState } from 'react';
import { observer } from 'mobx-react-lite';
import Chart from 'react-google-charts';
import MobxStore from '../State/mobxStore';
import styles from './BalanceHistory.module.css';
import Balance from './Balance';
import { useBalanceDialog } from './BalanceDialog';
import { BalanceInterface } from '../State/State';
import useMediaQuery from '../MediaQuery';

const BalanceHistory = () => {
  const { balances: { balances } } = useContext(MobxStore);
  const [BalanceDialog, showBalanceDialog] = useBalanceDialog();
  const [editedBalance, setEditedBalance] = useState<BalanceInterface | null>(null);

  const { isMobile } = useMediaQuery();

  const data = balances.slice()
    .sort((a, b) => {
      if (a.date > b.date) {
        return 1;
      }

      if (a.date < b.date) {
        return -1
      }

      return 0
    })
    .map((b) => [b.date.toISODate(), b.balance]);

  data.splice(0, 0, ['date', 'balance']);

  const showDialog = (balance: BalanceInterface) => {
    setEditedBalance(balance);
    showBalanceDialog();
  }

  const handleHideDialog = () => {
    setEditedBalance(null);
  }

  let className = styles.main;
  if (isMobile) {
    className += ' mobile';
  }

  return (
    <div className={`${className} window1`}>
      <div className="chart-wrapper window ">
        <Chart
          chartType="LineChart"
          data={data}
          options={{
            width: ('100%' as unknown) as number,
            height: ('100%' as unknown) as number,
            legend: { position: 'none' },
            hAxis: {
              slantedText: true,
            },
          }}
        />
      </div>
      <div className="window">
        {
          balances.map((b) => (
            <Balance key={b.id} balance={b} showBalanceDialog={showDialog} />
          ))
        }
      </div>
      <BalanceDialog balance={editedBalance} onHide={handleHideDialog} />
    </div>
  );
};

export default observer(BalanceHistory);
