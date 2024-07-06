import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../State/Store';
import Bill from './Bill';

const Overview = observer(() => {
  const { overview } = useStores()

  return (
    <div>
      <div>Overview</div>
      {
        overview.bills.map((bill) => (
          <Bill key={bill.id} bill={bill} />
        ))
      }
    </div>
  )
});

export default Overview;
