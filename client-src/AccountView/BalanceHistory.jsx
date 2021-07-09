import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import Chart from 'react-google-charts';
import MobxStore from '../state/mobxStore';

const BalanceHistory = () => {
  const { balances: { balances } } = useContext(MobxStore);
  const data = balances.map((b) => [b.date, b.balance]);
  data.splice(0, 0, ['date', 'balance']);

  return (
    <div className="chart-wrapper">
      <Chart
        chartType="LineChart"
        data={data}
        options={{
          width: '100%',
          height: '100%',
          legend: { position: 'none' },
          hAxis: {
            slantedText: true,
          },
        }}
      />
    </div>
  );
};

export default observer(BalanceHistory);
