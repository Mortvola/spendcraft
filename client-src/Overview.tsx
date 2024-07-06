import React from 'react';
import { useStores } from './State/Store';

const Overview = () => {
  const { overview } = useStores()

  return (
    <div>
      <div>Overview</div>
      {
        overview.bills.map((bill) => (
          <div key={bill.id}>{bill.name}</div>
        ))
      }
    </div>
  )
};

export default Overview;
