import { observer } from 'mobx-react-lite';
import React, { ReactElement } from 'react';
import { PendingTransactionInterface } from '../State/State';
import PendingTitles from './PendingTItles';
import PendingTransactions from './PendingTransactions';
import SecondaryRegister from './SecondaryRegister';

type PropsType = {
  categoryView: boolean,
  pending?: PendingTransactionInterface[],
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

export default observer(PendingRegister);
