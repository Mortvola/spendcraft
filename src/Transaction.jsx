import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import IconButton from './IconButton';
import { CategoryInput } from './CategoryInput';
import Amount from './Amount';
import { updateTransactionCategory, TransactionDialog } from './TransactionDialog';
import CategoryTransferDialog from './CategoryTransferDialog';
import { ModalLauncher } from './Modal';
import RebalanceDialog from './rebalance/RebalanceDialog';
import FundingDialog from './funding/FundingDialog';

const Transaction = ({
    transaction,
    amount,
    balance,
    selected,
    account,
    dispatch,
}) => {
    const handleClick = () => {
        // const { transaction, onClick } = props;

        // onClick(transaction.id);
    };

    const handleChange = (categoryId) => {
        const request = { splits: [{ categoryId, amount: transaction.amount }] };

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
                    {...props}
                />
            );
        }
    };

    const renderCategoryButton = () => {
        let categoryId = '';

        if (transaction.categories && transaction.categories.length > 0) {
            if (transaction.categories.length > 1) {
                return (
                    <ModalLauncher
                        launcher={(props) => (<button type="button" className="split-button" {...props}>Split</button>)}
                        dialog={(props) => renderTransactionDialog(props)}
                    />
                );
            }

            categoryId = transaction.categories[0].categoryId;
        }

        return <CategoryInput categoryId={categoryId} onChange={handleChange} />;
    };

    const renderBankInfo = () => {
        if (!account) {
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
    account: PropTypes.bool.isRequired,
};

export default connect()(Transaction);
