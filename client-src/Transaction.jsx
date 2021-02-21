import React from 'react';
import PropTypes from 'prop-types';
import IconButton from './IconButton';
import CategoryInput from './CategoryInput/CategoryInput';
import Amount from './Amount';
import { useTransactionDialog } from './TransactionDialog';
import { useCategoryTransferDialog } from './CategoryTransferDialog';
import { useRebalanceDialog } from './rebalance/RebalanceDialog';
import { useFundingDialog } from './funding/FundingDialog';

const Transaction = ({
  transaction,
  amount,
  balance,
  selected,
  categoryId,
  unassignedId,
  isMobile,
}) => {
  const [TransactionDialog1, showTransactionDialog1] = useTransactionDialog();
  const [TransactionDialog2, showTransactionDialog2] = useTransactionDialog();
  const [TransactionDialog3, showTransactionDialog3] = useTransactionDialog();
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();

  const handleClick = () => {
    // const { transaction, onClick } = props;

    // onClick(transaction.id);
  };

  const handleChange = (catId) => {
    const request = { splits: [{ categoryId: catId, amount: transaction.amount }] };

    transaction.updateTransactionCategory(request);
  };

  const TransactionDialog = ({ type: tranDialogType }) => {
    switch (transaction.type) {
      case 1:
        return (
          <CategoryTransferDialog
            transaction={transaction}
          />
        );

      case 2:
        return (
          <FundingDialog
            transaction={transaction}
          />
        );

      case 3:
        return (
          <RebalanceDialog
            transaction={transaction}
          />
        );

      case 0:
      default:
        switch (tranDialogType) {
          case 1:
            return (
              <TransactionDialog1
                transaction={transaction}
                categoryId={categoryId}
                unassignedId={unassignedId}
              />
            );

          case 2:
            return (
              <TransactionDialog2
                transaction={transaction}
                categoryId={categoryId}
                unassignedId={unassignedId}
              />
            );

          case 3:
            return (
              <TransactionDialog3
                transaction={transaction}
                categoryId={categoryId}
                unassignedId={unassignedId}
              />
            );

          default:
            return null;
        }
    }
  };

  const showTransactionDialog = (tranDialogType) => {
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
            showTransactionDialog1();
            break;

          case 2:
            showTransactionDialog2();
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

  const renderCategoryButton = () => {
    let catId = null;

    if (transaction.categories && transaction.categories.length > 0) {
      if (transaction.categories.length > 1) {
        return (
          <>
            <button type="button" className="split-button" onClick={() => showTransactionDialog(1)}>Split</button>
            <TransactionDialog type={1} />
          </>
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
          <div className="transaction-field">{transaction.institute_name}</div>
          <div className="transaction-field">{transaction.account_name}</div>
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
        <TransactionDialog type={2} />
      </div>
    );
  }

  return (
    <div className={className} onClick={handleClick}>
      <IconButton icon="edit" onClick={() => showTransactionDialog(2)} />
      <TransactionDialog type={2} />
      <div>{transaction.date}</div>
      <div className="transaction-field">{transaction.name}</div>
      <div className="trans-cat-edit">
        {renderCategoryButton()}
        <IconButton icon="list-ul" onClick={() => showTransactionDialog(3)} />
        <TransactionDialog type={3} />
      </div>
      <Amount className="transaction-field amount currency" amount={amount} />
      <Amount className="transaction-field balance currency" amount={balance} />
      {renderBankInfo()}
    </div>
  );
};

Transaction.propTypes = {
  transaction: PropTypes.shape().isRequired,
  amount: PropTypes.number.isRequired,
  balance: PropTypes.number.isRequired,
  selected: PropTypes.bool.isRequired,
  categoryId: PropTypes.number,
  unassignedId: PropTypes.number.isRequired,
  isMobile: PropTypes.bool,
};

Transaction.defaultProps = {
  categoryId: null,
  isMobile: false,
};

export default Transaction;
