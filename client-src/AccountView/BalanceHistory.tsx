import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import Chart from 'react-google-charts';
import { useStores } from '../State/Store';
import styles from './BalanceHistory.module.scss';
import Balance from './Balance';
import { useBalanceDialog } from './BalanceDialog';
import { BalanceInterface } from '../State/Types';
import { DateTime } from 'luxon';
import { TrackingType } from '../../common/ResponseTypes';

const BalanceHistory: React.FC = observer(() => {
  const { balances, uiState: { selectedAccount } } = useStores();
  const [BalanceDialog, showBalanceDialog] = useBalanceDialog();
  const [editedBalance, setEditedBalance] = useState<BalanceInterface | null>(null);

  React.useEffect(() => {
    if (selectedAccount) { //&& selectedAccount.tracking === TrackingType.Balances) {
      balances.load(selectedAccount);
    }
  }, [balances, selectedAccount]);

  let data: [string | null, string | number][] = [];

  const t: { balance: number, date: DateTime }[] = []
  const b = balances.balances

  if (b.length > 0) {
    t.push({ balance: b[0].balance, date: b[0].date })

    let d = t[0].date.minus({ days: 1 })
    for (let i = 1; i < b.length; i += 1) {
      while (d.toSeconds() > b[i].date.toSeconds()) {
        t.push({ balance: b[i].balance, date: d })
        d = d.minus({ day : 1 })
      }

      t.push({ balance: b[i].balance, date: b[i].date })
      d = b[i].date.minus({ days: 1})
    }

    data = t.reverse()
      .map((b) => [b.date.toISODate(), b.balance]);
  }

  data.splice(0, 0, ['date', 'balance']);

  const showDialog = (balance: BalanceInterface) => {
    setEditedBalance(balance);
    showBalanceDialog();
  }

  const handleHideDialog = () => {
    setEditedBalance(null);
  }

  return (
    <div className={`${styles.main} ${selectedAccount?.tracking === TrackingType.Balances ? styles.history : ''} window1`}>
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
      {
        selectedAccount?.tracking === TrackingType.Balances
          ? (
            <>
              <div className="window">
                <div className={styles.list}>
                  {balances.balances.map((b) => (
                    <Balance key={b.id} balance={b} showBalanceDialog={showDialog} />
                  ))}
                </div>
              </div><BalanceDialog balance={editedBalance} onHide={handleHideDialog} />
            </>
          )
          : null
      }
    </div>
  );
});

export default BalanceHistory;
