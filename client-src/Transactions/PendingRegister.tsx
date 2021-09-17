import { observer } from 'mobx-react-lite';
import React, { ReactElement } from 'react';
import { PendingTransactionInterface, TransactionContainerInterface } from '../State/State';
import PendingTitles from './PendingTItles';
import PendingTransactions from './PendingTransactions';
import SecondaryRegister from './SecondaryRegister';

type PropsType = {
  categoryView: boolean,
  pending?: TransactionContainerInterface<PendingTransactionInterface>,
}
const PendingRegister = ({
  categoryView,
  pending,
}: PropsType): ReactElement | null => {
  if (pending && pending.transactions.length > 0) {
    return (
      <SecondaryRegister
        title="Pending Transactions"
        titles={<PendingTitles categoryView={categoryView} />}
      >
        <PendingTransactions pending={pending.transactions} categoryView={categoryView} />
      </SecondaryRegister>
    );
  }

  return null;
};

export default observer(PendingRegister);
