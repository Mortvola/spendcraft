import React from 'react';
import PropTypes from 'prop-types';
import IconButton from './IconButton';
import { CategoryInput } from './CategoryInput';
import Amount from './Amount';
import { updateTransactionCategory, TransactionDialog } from './TransactionDialog';
import CategoryTransferDialog from './CategoryTransferDialog';
import { ModalLauncher } from './Modal';


function getTransactionAmountForCategory(transaction, categoryId) {
    let { amount } = transaction;

    if (transaction.categories !== undefined && transaction.categories !== null
        && categoryId !== undefined && categoryId !== null) {
        const index = transaction.categories.findIndex((c) => c.categoryId === categoryId);
        if (index !== -1) {
            amount = transaction.categories[index].amount;
        }
    }

    return amount;
}

class Transaction extends React.Component {
    constructor(props) {
        super(props);

        this.handleClick = this.handleClick.bind(this);
        this.handleEditClick = this.handleEditClick.bind(this);
        this.handleChange = this.handleChange.bind(this);
    }

    handleClick() {
        // const { transaction, onClick } = this.props;

        // onClick(transaction.id);
    }

    handleEditClick() {
        const { transaction, onEditClick } = this.props;

        onEditClick(transaction.id);
    }

    handleChange(categoryId) {
        const { transaction } = this.props;
        const request = { splits: [] };

        request.splits.push({ categoryId, amount: transaction.amount });

        updateTransactionCategory(transaction, request);
    }

    renderTransactionDialog(props) {
        const { transaction, categoryContext } = this.props;

        if (transaction.type === 1) {
            return (
                <CategoryTransferDialog
                    transaction={transaction}
                    {...props}
                />
            );
        }

        return (
            <TransactionDialog
                transaction={transaction}
                categoryContext={categoryContext}
                {...props}
            />
        );
    }

    renderCategoryButton() {
        const { transaction } = this.props;
        let categoryId = '';

        if (transaction.categories) {
            if (transaction.categories.length > 1) {
                return (
                    <ModalLauncher
                        launcher={(props) => (<button type="button" className="split-button" {...props}>Split</button>)}
                        title="Edit Transaction"
                        dialog={(props) => this.renderTransactionDialog(props)}
                    />
                );
            }

            categoryId = transaction.categories[0].categoryId;
        }

        return <CategoryInput categoryId={categoryId} onChange={this.handleChange} />;
    }

    render() {
        const {
            transaction, amount, balance, selected,
        } = this.props;

        let className = 'transaction';
        if (selected) {
            className += ' transaction-selected';
        }

        return (
            <div className={className} onClick={this.handleClick}>
                <ModalLauncher
                    launcher={(props) => (<IconButton icon="edit" {...props} />)}
                    title="Edit Transaction"
                    dialog={(props) => this.renderTransactionDialog(props)}
                />
                <div>{transaction.date}</div>
                <div className="transaction-field">{transaction.name}</div>
                <div className="trans-cat-edit">
                    {this.renderCategoryButton()}
                    <ModalLauncher
                        launcher={(props) => (<IconButton icon="list-ul" {...props} />)}
                        title="Edit Transaction"
                        dialog={(props) => this.renderTransactionDialog(props)}
                    />
                </div>
                <Amount className="transaction-field amount currency" amount={amount} />
                <Amount className="transaction-field balance currency" amount={balance} />
                <div className="transaction-field">{transaction.institute_name}</div>
                <div className="transaction-field">{transaction.account_name}</div>
            </div>
        );
    }
}

Transaction.propTypes = {
    onClick: PropTypes.func,
    onEditClick: PropTypes.func,
    transaction: PropTypes.object,
    amount: PropTypes.number,
    balance: PropTypes.number,
    selected: PropTypes.bool,
    categoryContext: PropTypes.number,
};

export { Transaction, getTransactionAmountForCategory };
