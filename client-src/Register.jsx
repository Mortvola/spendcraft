import React, { useState, useContext } from 'react';
import PropTypes from 'prop-types';
import { observer } from 'mobx-react-lite';
import { Spinner } from 'react-bootstrap';
import Transaction from './Transaction';
import Amount from './Amount';
import MobxStore from './state/mobxStore';

const Register = ({
  isMobile,
}) => {
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const {
    register: {
      categoryId,
      transactions,
      fetching,
      pending,
      balance,
    },
    categoryTree: {
      systemIds: {
        unassignedId,
      },
    },
  } = useContext(MobxStore);

  const handleClick = (transactionId) => {
    setSelectedTransaction(transactionId);
  };

  const renderTransactions = () => {
    const list = [];

    if (fetching) {
      return (
        <div className="please-wait">
          <Spinner animation="border" />
        </div>
      );
    }

    if (transactions) {
      let runningBalance = balance;
      transactions.forEach((transaction) => {
        let { amount } = transaction;

        if (categoryId !== null) {
          amount = transaction.getAmountForCategory(categoryId);
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
          isMobile={isMobile}
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

  const renderPendingTransactions = () => {
    const list = [];

    if (pending) {
      pending.forEach((transaction) => {
        list.push((
          <div key={transaction.id} className="pending-transaction striped">
            <div />
            <div>{transaction.date}</div>
            <div className="transaction-field">{transaction.name}</div>
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
          <div className="pending-register-title">
            Pending Transactions:
          </div>
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

  if (isMobile) {
    return renderTransactions();
  }

  return (
    <div className="register-with-pending">
      <div className="register">
        <div />
        {renderColumnTitles()}
        {renderTransactions()}
      </div>
      {renderPending()}
    </div>
  );
};

Register.propTypes = {
  isMobile: PropTypes.bool,
};

Register.defaultProps = {
  isMobile: false,
};

export default observer(Register);
