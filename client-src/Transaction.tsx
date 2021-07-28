import React, { ReactElement } from 'react';
import { observer } from 'mobx-react-lite';
import IconButton from './IconButton';
import CategoryInput from './CategoryInput/CategoryInput';
import Amount from './Amount';
import { useTransactionDialog } from './TransactionDialog';
import { useCategoryTransferDialog } from './CategoryTransferDialog';
import { useRebalanceDialog } from './rebalance/RebalanceDialog';
import { useFundingDialog } from './funding/FundingDialog';
import { isTransaction } from './state/Transaction';
import { TransactionType } from '../common/ResponseTypes';
import { TransactionInterface } from './state/State';

type PropsType = {
  transaction: TransactionInterface
  amount: number;
  balance: number;
  selected: boolean;
  categoryId: number | null;
  unassignedId: number;
  isMobile?: boolean;
}

const Transaction = ({
  transaction,
  amount,
  balance,
  selected,
  categoryId,
  unassignedId,
  isMobile,
}: PropsType): ReactElement => {
  const [TransactionDialog3, showTransactionDialog3] = useTransactionDialog();
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();

  const handleClick = () => {
    // const { transaction, onClick } = props;

    // onClick(transaction.id);
  };

  const handleChange = (catId: number, type: string) => {
    if (isTransaction(transaction)) {
      transaction.updateTransactionCategory([{
        type, categoryId: catId, amount: transaction.amount,
      }]);
    }
  };

  const TransactionDialog = () => {
    if (isTransaction(transaction)) {
      switch (transaction.type) {
        case TransactionType.TRANSFER_TRANSACTION:
          return (
            <CategoryTransferDialog transaction={transaction} />
          );

        case TransactionType.FUNDING_TRANSACTION:
          return (
            <FundingDialog transaction={transaction} />
          );

        case TransactionType.REBALANCE_TRANSACTION:
          return (
            <RebalanceDialog transaction={transaction} />
          );

        case TransactionType.REGULAR_TRANSACTION:
        default:
          return (
            <TransactionDialog3
              transaction={transaction}
              categoryId={categoryId}
              unassignedId={unassignedId}
            />
          );
      }
    }

    return null;
  };

  const showTransactionDialog = (tranDialogType: number) => {
    switch (transaction.type) {
      case 1:
        showCategoryTransferDialog();
        break;

      case 2:
        showFundingDialog();
        break;

      case 3:
        showRebalanceDialog();
        break;

      case 0:
      default:
        switch (tranDialogType) {
          case 1:
            showTransactionDialog3();
            break;

          case 2:
            showTransactionDialog3();
            break;

          case 3:
            showTransactionDialog3();
            break;

          default:
            break;
        }

        break;
    }
  };

  const CategoryButton = () => {
    let catId = null;

    if (transaction.categories && transaction.categories.length > 0) {
      if (transaction.categories.length > 1) {
        return (
          <button type="button" className="split-button" onClick={() => showTransactionDialog(1)}>Split</button>
        );
      }

      catId = transaction.categories[0].categoryId;
    }

    return <CategoryInput categoryId={catId} onChange={handleChange} />;
  };

  const renderBankInfo = () => {
    if (categoryId !== null) {
      return (
        <>
          <div className="transaction-field">{transaction.instituteName}</div>
          <div className="transaction-field">{transaction.accountName}</div>
        </>
      );
    }

    return null;
  };

  let className = 'transaction';
  if (selected) {
    className += ' transaction-selected';
  }

  if (isMobile) {
    className += ' mobile';

    return (
      <div className={className} onClick={() => showTransactionDialog(2)}>
        <div>
          {transaction.date}
        </div>
        <div className="transaction-field">
          {transaction.name}
        </div>
        <Amount amount={amount} />
        <TransactionDialog />
      </div>
    );
  }

  return (
    <div className={className} onClick={handleClick}>
      <IconButton icon="edit" onClick={() => showTransactionDialog(2)} />
      <div>{transaction.date}</div>
      <div className="transaction-field">{transaction.name}</div>
      {
        transaction.type !== TransactionType.STARTING_BALANCE
          ? (
            <div className="trans-cat-edit">
              <CategoryButton />
              <IconButton icon="list-ul" onClick={() => showTransactionDialog(3)} />
              <TransactionDialog />
            </div>
          )
          : <div />
      }
      <Amount className="transaction-field amount currency" amount={amount} />
      <Amount className="transaction-field balance currency" amount={balance} />
      {renderBankInfo()}
    </div>
  );
};

Transaction.defaultProps = {
  isMobile: false,
};

export default observer(Transaction);
