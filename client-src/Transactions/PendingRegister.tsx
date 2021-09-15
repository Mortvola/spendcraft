import React, { ReactElement } from 'react';
import PendingTransaction from '../State/PendingTransaction';
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
      >
        <PendingTransactions pending={pending} categoryView={categoryView} />
      </SecondaryRegister>
    );
  }

  return null;
};

export default PendingRegister;
