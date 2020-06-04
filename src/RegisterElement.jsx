import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import Transaction from './Transaction';
import getTransactionAmountForCategory from './TransactionUtils';

const mapStateToProps = (state) => ({
    transactions: state.transactions.transactions,
    balance: state.transactions.balance,
    categoryId: state.transactions.categoryId,
});

const RegisterElement = ({
    transactions,
    categoryId,
    ...props
}) => {
    let { balance } = props;

    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const handleClick = (transactionId) => {
        setSelectedTransaction(transactionId);
    };

    const renderTransactions = () => {
        const list = [];

        if (transactions) {
            transactions.forEach((transaction) => {
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

    if (categoryId === null) {
        return (
            <div className="register">
                <div className="register-title acct-transaction">
                    <div />
                    <div>Date</div>
                    <div>Name</div>
                    <div>Category</div>
                    <div className="currency">Amount</div>
                    <div className="currency">Balance</div>
                </div>
                <div className="transactions">
                    {renderTransactions()}
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
                {renderTransactions()}
            </div>
        </div>
    );
};

RegisterElement.propTypes = {
    transactions: PropTypes.arrayOf(PropTypes.shape()).isRequired,
    balance: PropTypes.number.isRequired,
    categoryId: PropTypes.number,
};

RegisterElement.defaultProps = {
    categoryId: null,
};

export default connect(mapStateToProps)(RegisterElement);
