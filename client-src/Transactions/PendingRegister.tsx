import { observer } from 'mobx-react-lite';
import React from 'react';
import { BaseTransactionInterface } from '../State/State';
import PendingTitles from './PendingTitles';
import PendingTransactions from './PendingTransactions';
import SecondaryRegister from './SecondaryRegister';

type PropsType = {
  categoryView: boolean,
  pending?: BaseTransactionInterface[],
}

const PendingRegister: React.FC<PropsType> = observer(({
  categoryView,
  pending,
}) => {
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
});

export default PendingRegister;
