/* eslint-disable jsx-a11y/label-has-associated-control */
import React from 'react';
import PropTypes from 'prop-types';
import { Field, ErrorMessage } from 'formik';
import CategorySplits from './CategorySplits';
import { ModalDialog } from './Modal';


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

const CategoryTransferDialog = (props) => {
    const {
        onClose,
        onExited,
        title,
        show,
        dispatch,
        transaction,
    } = props;
    // const amount = 0;

    // if (!date) {
    //     const now = new Date();

    //     const day = (`0${now.getDate()}`).slice(-2);
    //     const month = (`0${now.getMonth() + 1}`).slice(-2);

    //     date = `${now.getFullYear()}-${month}-${day}`;
    // }

    // const toCats = [];
    // const fromCats = [];

    // if (categories) {
    //     for (const cat of categories) {
    //         if (cat.amount >= 0) {
    //             toCats.push(cat);
    //         }
    //         else {
    //             fromCats.push(cat);
    //         }
    //     }
    // }

    // $("#catTransferForm [name='date']").val(date);

    // const toCatSplits = new CategorySplits($('#catTransferForm .available-funds'), $('#catTransferForm .to-split-items'), amount, toCats, false);

    // const fromCatSplits = new CategorySplits($('#catTransferForm .transfer-total'), $('#catTransferForm .from-split-items'), amount, fromCats, true, -1,
    //     (delta) => {
    //         toCatSplits.availableChanged(delta);
    //     });

    // $('#catTransferForm .amount-input.transfer-amount')
    //     .attr('value', amount.toFixed(2))
    //     .attr('data-last-amount', amount)
    //     .val(amount)
    //     .change()
    //     .off('delta-change')
    //     .on('delta-change', (event, amount, delta) => {
    //         toCatSplits.availableChanged(delta);
    //     });

    // $('#catTransferDialog').modal('show');

    // $('#catTransferForm').off('submit');
    // $('#catTransferForm').submit((event) => {
    //     event.preventDefault();

    const handleSubmit = (values) => {
        const { date, fromCategories, toCategories } = values;
        const cats = fromCategories.concat(toCategories).map((s) => {
            if (s.id < 0) {
                const { id, ...newSplit } = s;

                return newSplit;
            }

            return s;
        });

        if (transaction) {
            $.ajax({
                method: 'PATCH',
                url: `/category_transfer/${transaction.id}`,
                headers:
                {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                },
                contentType: 'application/json',
                data: JSON.stringify({ date, categories: cats }),
            })
                .done((response) => {
                    onClose();
                });
        }
        else {
            $.post({
                url: '/category_transfer',
                headers:
                {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                },
                contentType: 'application/json',
                data: JSON.stringify({ date, categories: cats }),
            })
                .done((response) => {
                    onClose();
                });
        }
    }

    const handleValidate = (values) => {
        const errors = {};
        const fromSum = values.fromCategories.reduce((accum, item) => accum + Math.floor(item.amount * -100), 0);
        const toSum = values.toCategories.reduce((accum, item) => accum + Math.floor(item.amount * 100), 0);

        if (fromSum !== toSum) {
            errors.splits = 'The sum of the From categories does not match the sum of the To categories.';
        }

        return errors;
    };

    const handleTotalChange = (delta) => {

    };

    const handleDelete = () => {
        fetch(`/category_transfer/${transaction.id}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
            },
        })
            .then(() => {
                onClose();
            });
    };

    return (
        <ModalDialog
            initialValues={{
                fromCategories: transaction && transaction.categories ? transaction.categories.filter((c) => c.amount < 0) : [{ amount: 0 }],
                toCategories: transaction && transaction.categories ? transaction.categories.filter((c) => c.amount >= 0) : [{ amount: 0 }],
                date: transaction ? transaction.date : null,
            }}
            validate={handleValidate}
            onSubmit={handleSubmit}
            onDelete={transaction
                ? handleDelete
                : undefined}
            show={show}
            onClose={onClose}
            onExited={onExited}
            title={title}
            size="lg"
            form={() => (
                <>
                    <div>
                        <div>
                            <label>
                                Date
                                <Field type="date" name="date" />
                            </label>
                        </div>
                        <label>
                            From:
                        </label>
                        <div className="cat-fund-table">
                            <div className="transaction-split-item cat-fund-title">
                                <div className="fund-list-cat-name">Category</div>
                                <div className="dollar-amount">Balance</div>
                                <div className="dollar-amount">Amount</div>
                                <div className="dollar-amount">New Balance</div>
                            </div>
                            <Field name="fromCategories" validate={validateSplits}>
                                {({ field: { value, name }, form: { setFieldValue } }) => (
                                    <CategorySplits
                                        splits={value.map((s) => (
                                            { ...s, ...{ amount: s.amount * -1 } }
                                        ))}
                                        total={0}
                                        onChange={(splits, delta) => {
                                            setFieldValue(name, splits.map((s) => (
                                                { ...s, ...{ amount: s.amount * -1 } }
                                            )));
                                            handleTotalChange(delta);
                                        }}
                                    />
                                )}
                            </Field>
                            <label>
                                Transfer Total
                                <div className="transfer-total splits-total dollar-amount">0.00</div>
                            </label>
                        </div>
                    </div>
                    <br />
                    <label>
                        To:
                    </label>
                    <div className="cat-fund-table">
                        <div className="transaction-split-item cat-fund-title">
                            <div className="fund-list-cat-name">Category</div>
                            <div className="dollar-amount">Balance</div>
                            <div className="dollar-amount">Amount</div>
                            <div className="dollar-amount">New Balance</div>
                        </div>
                        <Field name="toCategories" validate={validateSplits}>
                            {({ field: { value, name }, form: { setFieldValue } }) => (
                                <CategorySplits
                                    splits={value}
                                    total={0}
                                    onChange={(splits, delta) => {
                                        setFieldValue(name, splits);
                                        handleTotalChange(delta);
                                    }}
                                />
                            )}
                        </Field>
                        <label className="dollar-amount">
                            Unassigned
                            <div className="available-funds splits-total dollar-amount">0.00</div>
                        </label>
                    </div>
                    <ErrorMessage name="splits" />
                </>
            )}
        />
    );
};

CategoryTransferDialog.propTypes = {
    onClose: PropTypes.func.isRequired,
    onExited: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
    show: PropTypes.bool.isRequired,
    dispatch: PropTypes.func.isRequired,
    transaction: PropTypes.shape({
        id: PropTypes.number.isRequired,
        categories: PropTypes.arrayOf(PropTypes.shape).isRequired,
        date: PropTypes.string.isRequired,
    }),
};

CategoryTransferDialog.defaultProps = {
    transaction: null,
};

export default CategoryTransferDialog;
