import React from 'react';
import PropTypes from 'prop-types';
import IconButton from './IconButton';
import { CategoryInput } from './CategoryInput';
import Amount from './Amount';
import { updateTransactionCategory, TransactionDialog } from './TransactionDialog';
import CategoryTransferDialog from './CategoryTransferDialog';
import { ModalLauncher } from './Modal';


const Transaction = ({
    transaction,
    amount,
    balance,
    selected,
    categoryContext,
}) => {
    const handleClick = () => {
        // const { transaction, onClick } = props;

        // onClick(transaction.id);
    };

    const handleChange = (categoryId) => {
        const request = { splits: [{ categoryId, amount: transaction.amount }] };

        updateTransactionCategory(transaction, request);
    };

    const renderTransactionDialog = (props) => {
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
    };

    const renderCategoryButton = () => {
        let categoryId = '';

        if (transaction.categories) {
            if (transaction.categories.length > 1) {
                return (
                    <ModalLauncher
                        launcher={(props) => (<button type="button" className="split-button" {...props}>Split</button>)}
                        title="Edit Transaction"
                        dialog={(props) => renderTransactionDialog(props)}
                    />
                );
            }

            categoryId = transaction.categories[0].categoryId;
        }

        return <CategoryInput categoryId={categoryId} onChange={handleChange} />;
    };

    let className = 'transaction';
    if (selected) {
        className += ' transaction-selected';
    }

    return (
        <div className={className} onClick={handleClick}>
            <ModalLauncher
                launcher={(props) => (<IconButton icon="edit" {...props} />)}
                title="Edit Transaction"
                dialog={(props) => renderTransactionDialog(props)}
            />
            <div>{transaction.date}</div>
            <div className="transaction-field">{transaction.name}</div>
            <div className="trans-cat-edit">
                {renderCategoryButton()}
                <ModalLauncher
                    launcher={(props) => (<IconButton icon="list-ul" {...props} />)}
                    title="Edit Transaction"
                    dialog={(props) => renderTransactionDialog(props)}
                />
            </div>
            <Amount className="transaction-field amount currency" amount={amount} />
            <Amount className="transaction-field balance currency" amount={balance} />
            <div className="transaction-field">{transaction.institute_name}</div>
            <div className="transaction-field">{transaction.account_name}</div>
        </div>
    );
};

Transaction.propTypes = {
    onClick: PropTypes.func.isRequired,
    onEditClick: PropTypes.func.isRequired,
    transaction: PropTypes.shape().isRequired,
    amount: PropTypes.number.isRequired,
    balance: PropTypes.number.isRequired,
    selected: PropTypes.bool.isRequired,
    categoryContext: PropTypes.number.isRequired,
};

export default Transaction;
