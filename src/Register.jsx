import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import Transaction from './Transaction';
import getTransactionAmountForCategory from './TransactionUtils';
import Amount from './Amount';

const mapStateToProps = (state) => ({
    fetching: state.transactions.fetching,
    transactions: state.transactions.transactions,
    pending: state.transactions.pending,
    balance: state.transactions.balance,
    categoryId: state.transactions.categoryId,
});

const Register = ({
    fetching,
    transactions,
    pending,
    categoryId,
    ...props
}) => {
    let { balance } = props;

    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const handleClick = (transactionId) => {
        setSelectedTransaction(transactionId);
    };

    const renderTransactions = (trans) => {
        const list = [];

        if (!fetching && trans) {
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
                    balance={balance}
                    onClick={handleClick}
                    selected={selected}
                    account={categoryId === null}
                />);

                if (balance !== undefined) {
                    balance -= amount;
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
        if (pending.length > 0) {
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
};

Register.defaultProps = {
    pending: [],
    categoryId: null,
};

export default connect(mapStateToProps)(Register);
