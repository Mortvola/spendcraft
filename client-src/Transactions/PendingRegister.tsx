import React, { ReactElement } from 'react';
import PendingTransaction from '../state/PendingTransaction';
import PendingTitles from './PendingTItles';
import PendingTransactions from './PendingTransactions';
import SecondaryRegister from './SecondaryRegister';

type PropsType = {
  categoryView: boolean,
  pending?: PendingTransaction[],
}
const PendingRegister = ({
  categoryView,
  pending,
}: PropsType): ReactElement | null => {
  if (pending && pending.length > 0) {
    return (
      <SecondaryRegister
        title="Pending Transactions"
        titles={<PendingTitles categoryView={categoryView} />}
        transactions={<PendingTransactions pending={pending} categoryView={categoryView} />}
      />
    );
  }

  return null;
};

export default PendingRegister;
