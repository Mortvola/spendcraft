import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Spinner } from 'react-bootstrap';
import Transaction from './Transaction';
import getTransactionAmountForCategory from './TransactionUtils';
import Amount from './Amount';

const mapStateToProps = (state) => ({
  fetching: state.transactions.fetching,
  transactions: state.transactions.transactions,
  pending: state.transactions.pending,
  balance: state.transactions.balance,
  categoryId: state.transactions.categoryId,
  unassignedId: state.categoryTree.unassignedId,
});

const Register = ({
  fetching,
  transactions,
  pending,
  categoryId,
  unassignedId,
  balance,
}) => {
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const handleClick = (transactionId) => {
    setSelectedTransaction(transactionId);
  };

  const renderTransactions = (trans) => {
    const list = [];

    if (fetching) {
      return (
        <div className="please-wait">
          <Spinner animation="border" />
        </div>
      );
    }

    if (trans) {
      let runningBalance = balance;
      trans.forEach((transaction) => {
        let { amount } = transaction;

        if (categoryId !== null) {
          amount = getTransactionAmountForCategory(transaction, categoryId);
        }

        const selected = selectedTransaction === transaction.id;

        list.push(<Transaction
          key={transaction.id}
          transaction={transaction}
          amount={amount}
          balance={runningBalance}
          onClick={handleClick}
          selected={selected}
          categoryId={categoryId}
          unassignedId={unassignedId}
        />);

        if (runningBalance !== undefined) {
          runningBalance -= amount;
        }
      });
    }

    return (
      <div className="transactions">
        {list}
      </div>
    );
  };

  const renderPendingTransactions = (trans) => {
    const list = [];

    if (trans) {
      trans.forEach((transaction) => {
        list.push((
          <div key={transaction.id} className="pending-transaction striped">
            <div />
            <div>{transaction.date}</div>
            <div>{transaction.name}</div>
            <Amount amount={transaction.amount} />
          </div>
        ));
      });
    }

    return list;
  };

  const renderPending = () => {
    if (!fetching && pending.length > 0) {
      return (
        <div className="register">
          Pending Transactions:
          <div className="register-title pending-transaction">
            <div />
            <div>Date</div>
            <div>Name</div>
            <div className="currency">Amount</div>
            <div />
            <div />
          </div>
          <div className="transactions striped">
            {renderPendingTransactions(pending)}
          </div>
        </div>
      );
    }

    return null;
  };

  const renderColumnTitles = () => {
    if (categoryId === null) {
      return (
        <div className="register-title acct-transaction">
          <div />
          <div>Date</div>
          <div>Name</div>
          <div>Category</div>
          <div className="currency">Amount</div>
          <div className="currency">Balance</div>
        </div>
      );
    }

    return (
      <div className="register-title transaction">
        <div />
        <div>Date</div>
        <div>Name</div>
        <div>Category</div>
        <div className="currency">Amount</div>
        <div className="currency">Balance</div>
        <div>Institution</div>
        <div>Account</div>
      </div>
    );
  };

  return (
    <div className="register-with-pending">
      <div className="register">
        <div />
        {renderColumnTitles()}
        {renderTransactions(transactions)}
      </div>
      {renderPending()}
    </div>
  );
};

Register.propTypes = {
  fetching: PropTypes.bool.isRequired,
  transactions: PropTypes.arrayOf(PropTypes.shape()).isRequired,
  pending: PropTypes.arrayOf(PropTypes.shape()),
  balance: PropTypes.number.isRequired,
  categoryId: PropTypes.number,
  unassignedId: PropTypes.number,
};

Register.defaultProps = {
  pending: [],
  categoryId: null,
  unassignedId: null,
};

export default connect(mapStateToProps)(Register);
