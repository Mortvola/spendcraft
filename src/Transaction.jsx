import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import IconButton from './IconButton';
import CategoryInput from './CategoryInput/CategoryInput';
import Amount from './Amount';
import TransactionDialog, { updateTransactionCategory, useTransactionDialog } from './TransactionDialog';
import CategoryTransferDialog from './CategoryTransferDialog';
import { ModalLauncher } from './Modal';
import RebalanceDialog from './rebalance/RebalanceDialog';
import FundingDialog from './funding/FundingDialog';

const Transaction = ({
  transaction,
  amount,
  balance,
  selected,
  categoryId,
  unassignedId,
  isMobile,
  dispatch,
}) => {
  const [TransactionDialog2, showTransactionDialog] = useTransactionDialog();

  const handleClick = () => {
    // const { transaction, onClick } = props;

    // onClick(transaction.id);
  };

  const handleChange = (catId) => {
    const request = { splits: [{ categoryId: catId, amount: transaction.amount }] };

    updateTransactionCategory(transaction, request, dispatch);
  };

  const renderTransactionDialog = (props) => {
    switch (transaction.type) {
      case 1:
        return (
          <CategoryTransferDialog
            transaction={transaction}
            {...props}
          />
        );

      case 2:
        return (
          <FundingDialog
            transaction={transaction}
            {...props}
          />
        );

      case 3:
        return (
          <RebalanceDialog
            transaction={transaction}
            {...props}
          />
        );

      case 0:
      default:
        return (
          <TransactionDialog
            transaction={transaction}
            categoryId={categoryId}
            unassignedId={unassignedId}
            {...props}
          />
        );
    }
  };

  const renderCategoryButton = () => {
    let catId = null;

    if (transaction.categories && transaction.categories.length > 0) {
      if (transaction.categories.length > 1) {
        return (
          <ModalLauncher
            launcher={(props) => (<button type="button" className="split-button" {...props}>Split</button>)}
            dialog={(props) => renderTransactionDialog(props)}
          />
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
      <div className={className} onClick={showTransactionDialog}>
        <div>
          {transaction.date}
        </div>
        <div className="transaction-field">
          {transaction.name}
        </div>
        <div>
          {amount}
        </div>
        <TransactionDialog2 transaction={transaction} />
      </div>
    );
  }

  return (
    <div className={className} onClick={handleClick}>
      <ModalLauncher
        launcher={(props) => (<IconButton icon="edit" {...props} />)}
        dialog={(props) => renderTransactionDialog(props)}
      />
      <div>{transaction.date}</div>
      <div className="transaction-field">{transaction.name}</div>
      <div className="trans-cat-edit">
        {renderCategoryButton()}
        <ModalLauncher
          launcher={(props) => (<IconButton icon="list-ul" {...props} />)}
          dialog={(props) => renderTransactionDialog(props)}
        />
      </div>
      <Amount className="transaction-field amount currency" amount={amount} />
      <Amount className="transaction-field balance currency" amount={balance} />
      {renderBankInfo()}
    </div>
  );
};

Transaction.propTypes = {
  onClick: PropTypes.func.isRequired,
  transaction: PropTypes.shape().isRequired,
  amount: PropTypes.number.isRequired,
  balance: PropTypes.number.isRequired,
  selected: PropTypes.bool.isRequired,
  dispatch: PropTypes.func.isRequired,
  categoryId: PropTypes.number.isRequired,
  unassignedId: PropTypes.number.isRequired,
  isMobile: PropTypes.bool,
};

Transaction.defaultProps = {
  isMobile: false,
};

export default connect()(Transaction);
