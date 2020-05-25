/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Field, ErrorMessage } from 'formik';
import CategorySplits from './CategorySplits';
import { setTextElementAmount } from './NumberFormat';
import getTransactionAmountForCategory from './TransactionUtils';
import { ModalDialog } from './Modal';

function updateCategory(id, amount) {
    setTextElementAmount($(`#categories [data-cat="${id}"]`), amount);
}

function updateCategories(categories) {
    categories.forEach((category) => updateCategory(category.id, category.amount));
}

function updateTransactionCategory(transaction, request, categoryId) {
    const oldAmount = getTransactionAmountForCategory(transaction, categoryId);

    $.ajax({
        url: `/transaction/${transaction.id}`,
        contentType: 'application/json',
        method: 'PATCH',
        data: JSON.stringify(request),
    })
        .done((response) => {
            updateCategories(response.categories);

            transaction.categories = response.splits;

            let newAmount;

            if (transaction.categories) {
                for (const c of transaction.categories) {
                    c.amount = parseFloat(c.amount);
                }

                newAmount = getTransactionAmountForCategory(transaction, categoryId);
            }

            document.dispatchEvent(new CustomEvent('transactionUpdated', { detail: { transaction, delta: newAmount - oldAmount } }));
        });
}

function validateSplits(splits) {
    let error;

    if (splits !== undefined && splits.length > 0) {
        for (const split of splits) {
            if (split.categoryId === null || split.categoryId === undefined) {
                error = 'There are one or more items not assigned a category.';
                break;
            }
        }
    }

    return error;
}

const TransactionDialog = (props) => {
    const {
        show,
        onClose,
        onExited,
        title,
        transaction,
        categoryContext,
    } = props;

    const [remaining, setRemaining] = useState(() => {
        let sum = 0;
        if (transaction.categories) {
            sum = transaction.categories.reduce((accum, item) => accum + item.amount, 0);
        }

        return Math.abs(transaction.amount) - sum;
    });

    const handleTotalChange = (delta) => {
        setRemaining((prevRemaining) => {
            let result = (parseFloat(prevRemaining) + delta).toFixed(2);
            if (result === '-0.00') {
                result = '0.00';
            }
            return result;
        });
    };

    const handleValidate = (values) => {
        const errors = {};
        const sum = values.splits.reduce((accum, item) => accum + Math.floor(item.amount * 100), 0);

        if (sum !== Math.abs(transaction.amount) * 100) {
            errors.splits = 'The sum of the categories does not match the transaction amount.';
        }

        return errors;
    };

    const handleSubmit = (values) => {
        const { splits } = values;
        if (transaction.amount < 0) {
            splits.forEach((element) => {
                element.amount *= -1;
            });
        }

        updateTransactionCategory(transaction, { splits }, categoryContext);
    };

    return (
        <ModalDialog
            initialValues={{
                splits: transaction.categories
                    ? transaction.categories
                    : [{ amount: Math.abs(transaction.amount) }],
            }}
            validate={handleValidate}
            onSubmit={handleSubmit}
            show={show}
            onClose={onClose}
            onExited={onExited}
            title={title}
            form={() => (
                <>
                    <div className="cat-fund-table">
                        <div className="transaction-split-item cat-fund-title">
                            <div className="fund-list-cat-name">Category</div>
                            <div className="dollar-amount">Balance</div>
                            <div className="dollar-amount">Amount</div>
                            <div className="dollar-amount">New Balance</div>
                        </div>

                        <Field name="splits" validate={validateSplits}>
                            {({ field: { value, name }, form: { setFieldValue } }) => (
                                <CategorySplits
                                    splits={value}
                                    total={Math.abs(transaction.amount)}
                                    onChange={(splits, delta) => {
                                        setFieldValue(name, splits);
                                        handleTotalChange(delta);
                                    }}
                                />
                            )}
                        </Field>
                        <ErrorMessage name="splits" />

                        <div className="transaction-split-item">
                            <div />
                            <div className="dollar-amount">
                                <label>Unassigned</label>
                                <div className="available-funds splits-total dollar-amount">{remaining}</div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        />
    );
};

TransactionDialog.propTypes = {
    show: PropTypes.bool.isRequired,
    transaction: PropTypes.shape({
        amount: PropTypes.number.isRequired,
        categories: PropTypes.array,
    }).isRequired,
    categoryContext: PropTypes.number.isRequired,
    onClose: PropTypes.func.isRequired,
    onExited: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
};

TransactionDialog.defaultProps = {
};

export { updateTransactionCategory, TransactionDialog };
