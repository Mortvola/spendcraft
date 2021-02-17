/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Field, ErrorMessage } from 'formik';
import CategorySplits from './CategorySplits';
import useModal, { ModalDialog } from './Modal';
import Amount from './Amount';

function validateSplits(splits) {
  let error;

  if (splits !== undefined) {
    if (splits.some((split) => split.categoryId === null || split.categoryId === undefined)) {
      error = 'There are one or more items not assigned a category.';
    }
  }

  return error;
}

const TransactionDialog = ({
  show,
  onClose,
  onExited,
  title,
  transaction,
  categoryId,
  unassignedId,
}) => {
  const showBalances = categoryId === unassignedId;

  const computeRemaining = (categories, sign = 1) => {
    let sum = 0;
    if (categories) {
      sum = categories.reduce((accum, item) => {
        if (item.categoryId !== undefined && item.categoryId !== unassignedId) {
          return accum + item.amount;
        }

        return accum;
      }, 0);
    }

    return Math.abs(transaction.amount) - sign * sum;
  };

  const [remaining, setRemaining] = useState(
    computeRemaining(transaction.categories, Math.sign(transaction.amount)),
  );

  const handleValidate = (values) => {
    const errors = {};
    const sum = values.splits.reduce((accum, item) => accum + Math.round(item.amount * 100), 0);

    if (sum !== Math.abs(Math.round(transaction.amount * 100))) {
      errors.splits = 'The sum of the categories does not match the transaction amount.';
    }

    return errors;
  };

  const handleSubmit = (values) => {
    const { splits } = values;

    // If the transaction amount is less then zero then
    // negate all of the category amounts.
    if (transaction.amount < 0) {
      splits.forEach((element) => {
        element.amount *= -1;
      });
    }

    const errors = transaction.updateTransactionCategory({ splits });

    if (!errors) {
      onClose();
    }
  };

  const renderBalanceHeaders = () => {
    if (showBalances) {
      return (
        <>
          <div className="dollar-amount">Current Balance</div>
          <div className="dollar-amount">New Balance</div>
        </>
      );
    }

    return null;
  };

  return (
    <ModalDialog
      initialValues={{
        splits: transaction.categories
          ? transaction.categories.map((c) => ({
            ...c,
            amount: c.amount * Math.sign(transaction.amount),
          }))
          : [{ amount: Math.abs(transaction.amount) }],
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      show={show}
      onClose={onClose}
      onExited={onExited}
      title={title}
      size={showBalances ? 'lg' : 'md'}
      form={() => {
        let splitItemClass = 'transaction-split-item';
        if (!showBalances) {
          splitItemClass += ' no-balances';
        }

        return (
          <>
            <div className="cat-fund-table">
              <div className={`${splitItemClass} cat-fund-title`}>
                <div className="fund-list-cat-name">Category</div>
                <div className="dollar-amount">Amount</div>
                {renderBalanceHeaders()}
              </div>

              <Field name="splits" validate={validateSplits}>
                {({ field: { value, name }, form: { setFieldValue } }) => (
                  <CategorySplits
                    splits={value}
                    total={Math.abs(transaction.amount)}
                    credit={transaction.amount >= 0}
                    showBalances={showBalances}
                    onChange={(splits) => {
                      setFieldValue(name, splits);
                      setRemaining(computeRemaining(splits));
                    }}
                  />
                )}
              </Field>
              <ErrorMessage name="splits" />

              <div className={splitItemClass}>
                {showBalances ? <div /> : null}
                <div className="unassigned-label">Unassigned:</div>
                <Amount amount={remaining} />
              </div>
            </div>
          </>
        );
      }}
    />
  );
};

TransactionDialog.propTypes = {
  show: PropTypes.bool.isRequired,
  transaction: PropTypes.shape({
    amount: PropTypes.number.isRequired,
    categories: PropTypes.arrayOf(PropTypes.shape()),
    updateTransactionCategory: PropTypes.func.isRequired,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onExited: PropTypes.func.isRequired,
  title: PropTypes.string,
  categoryId: PropTypes.number,
  unassignedId: PropTypes.number.isRequired,
};

TransactionDialog.defaultProps = {
  title: 'Transaction Categories',
  categoryId: null,
};

const useTransactionDialog = () => useModal(TransactionDialog);

export default TransactionDialog;
export { useTransactionDialog };
