/* eslint-disable jsx-a11y/label-has-associated-control */
import React from 'react';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import {
  ModalBody, ModalFooter, ModalHeader,
} from 'react-bootstrap';
import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import Transaction from '../State/Transaction';
import Amount from '../Amount';
import { TransactionProps } from '../../common/ResponseTypes';

type TransationPropsType = {
  name?: string,
  date?: DateTime,
  amount?: number,
}

const TransactionFields: React.FC<TransationPropsType> = ({ name, date, amount }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <input readOnly value={name} />
      <label style={{ display: 'flex', flexDirection: 'column' }}>
        Date:
        <input type="date" readOnly value={date?.toISODate() ?? ''} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column' }}>
        Amount:
        <Amount amount={amount} />
      </label>
    </div>
  </div>
)

type PropsType = {
  transaction: Transaction,
}

const DuplicateDialog: React.FC<PropsType & ModalProps> = ({
  setShow,
  transaction,
}: PropsType & ModalProps) => {
  const [otherTransaction, setOtherTransaction] = React.useState<TransactionProps | null>(null);
  React.useEffect(() => {
    (async () => {
      const response = await Http.get<TransactionProps>(`/api/v1/transaction/${transaction.duplicateOfTransactionId}`);

      if (response.ok) {
        const body = await response.body();

        setOtherTransaction(body);
      }
    })();
  }, [transaction.duplicateOfTransactionId]);

  const handleKeepBoth = async () => {
    const errors = await transaction.dedup();

    if (!errors) {
      setShow(false);
    }
  };

  const handleDeleteDuplicate = async () => {
    const errors = await transaction.delete();

    if (!errors) {
      setShow(false);
    }
  };

  const handleCancel = () => {
    setShow(false);
  }

  return (
    <>
      <ModalHeader>
        Duplicate Transaction
      </ModalHeader>
      <ModalBody>
        <TransactionFields
          name={transaction.name}
          date={transaction.date}
          amount={transaction.amount}
        />
        <div style={{ borderTop: 'solid black thin', margin: '1rem' }} />
        <TransactionFields
          name={otherTransaction?.accountTransaction.name}
          date={otherTransaction?.date ? DateTime.fromISO(otherTransaction?.date) : undefined}
          amount={otherTransaction?.accountTransaction.amount}
        />
      </ModalBody>
      <ModalFooter>
        <div style={{ display: 'flex', columnGap: '0.5rem' }}>
          <button type="button" onClick={handleCancel}>Cancel</button>
          <button type="button" onClick={handleKeepBoth}>No, these are not duplicates</button>
          <button type="button" onClick={handleDeleteDuplicate}>Yes, these are duplicates</button>
        </div>
      </ModalFooter>
    </>
  );
};

export const useDuplicateDialog = makeUseModal<PropsType>(DuplicateDialog, { size: 'lg' });

export default DuplicateDialog;
