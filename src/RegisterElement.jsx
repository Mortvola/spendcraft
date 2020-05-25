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

const RegisterElement = connect(mapStateToProps)((props) => {
    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const handleClick = (transactionId) => {
        setSelectedTransaction(transactionId);
    };

    const renderTransactions = () => {
        const list = [];
        const { transactions, categoryId } = props;
        let { balance } = props;

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
                    categoryContext={categoryId}
                    onClick={handleClick}
                    selected={selected}
                />);

                if (balance !== undefined) {
                    balance -= amount;
                }
            });
        }

        return list;
    };

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
});

RegisterElement.propTypes = {
    transactions: PropTypes.arrayOf().isRequired,
    balance: PropTypes.number.isRequired,
    categoryId: PropTypes.number,
    onEdit: PropTypes.func.isRequired,
};

export default RegisterElement;
