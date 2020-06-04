import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import Transaction from './Transaction';
import getTransactionAmountForCategory from './TransactionUtils';
import Amount from './Amount';

const mapStateToProps = (state) => ({
    transactions: state.transactions.transactions,
    pending: state.transactions.pending,
    balance: state.transactions.balance,
    categoryId: state.transactions.categoryId,
});

const RegisterElement = ({
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

        if (trans) {
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

        return list;
    };

    const renderPendingTransactions = (trans) => {
        const list = [];

        if (trans) {
            trans.forEach((transaction) => {
                list.push((
                    <div className="pending-transaction striped">
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

    if (categoryId === null) {
        const postedTitle = pending.length > 0 ? 'Posted Transactions:' : '';

        return (
            <div className="register-with-pending">
                {renderPending()}
                <div className="register">
                    {postedTitle}
                    <div className="register-title acct-transaction">
                        <div />
                        <div>Date</div>
                        <div>Name</div>
                        <div>Category</div>
                        <div className="currency">Amount</div>
                        <div className="currency">Balance</div>
                    </div>
                    <div className="transactions">
                        {renderTransactions(transactions)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="register">
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
            <div className="transactions">
                {renderTransactions(transactions)}
            </div>
        </div>
    );
};

RegisterElement.propTypes = {
    transactions: PropTypes.arrayOf(PropTypes.shape()).isRequired,
    pending: PropTypes.arrayOf(PropTypes.shape()),
    balance: PropTypes.number.isRequired,
    categoryId: PropTypes.number,
};

RegisterElement.defaultProps = {
    pending: [],
    categoryId: null,
};

export default connect(mapStateToProps)(RegisterElement);
