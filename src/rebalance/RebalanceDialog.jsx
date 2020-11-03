/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Field, ErrorMessage } from 'formik';
import { ModalDialog } from '../Modal';
import CategoryRebalance from './CategoryRebalance';
import Amount from '../Amount';

const RebalanceDialog = ({
  onClose,
  onExited,
  title,
  show,
  transaction,
}) => {
  const [categoryTree, setCategoryTree] = useState(null);
  const [unassigned, setUnassigned] = useState(0);
  const [date, setDate] = useState(transaction ? transaction.date : '');

  const fetchCategoryBalances = (fetchDate) => {
    if (fetchDate !== '') {
      const params = { date: fetchDate };
      if (transaction) {
        params.id = transaction.id;
      }

      const url = new URL('/category_balances', window.location.href);
      url.search = new URLSearchParams(params);

      fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then(
          (response) => response.json(),
          (error) => console.log('fetch error: ', error),
        )
        .then(
          (json) => {
            setCategoryTree(json);
          },
        );
    }
  };

  useEffect(() => {
    fetchCategoryBalances(date);
  }, [date]);

  const handleDateChange = (event) => {
    setDate(event.target.value);
  };

  const handleDeltaChange = (delta) => {
    setUnassigned(unassigned - delta);
  };

  const handleValidate = (values) => {
    const errors = {};

    if (values.date === '') {
      errors.date = 'A date must be specified.';
    }

    if (values.categories.length === 0) {
      errors.categories = 'There must be at least one adjustment.';
    }
    else {
      const sum = values.categories.reduce((accumulator, currentValue) => (
        accumulator + Math.round(currentValue.amount * 100)
      ), 0);

      if (sum !== 0) {
        errors.categories = 'The sum of the adjustments must be zero.';
      }
    }

    return errors;
  };

  const handleSubmit = (values) => {
    // const { setErrors } = bag;
    let url = '/category_transfer';
    if (transaction) {
      url += `/${transaction.id}`;
    }

    fetch(url, {
      method: (transaction ? 'PATCH' : 'POST'),
      headers:
      {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...values, type: 3 }),
    })
      .then(
        () => onClose(),
        (error) => console.log('fetch error: ', error),
      );
  };

  return (
    <ModalDialog
      initialValues={{
        categories: transaction ? transaction.categories : [],
        date,
      }}
      categoryTree={categoryTree}
      validate={handleValidate}
      onSubmit={handleSubmit}
      show={show}
      onClose={onClose}
      onExited={onExited}
      title={title}
      size="lg"
      scrollable
      form={() => (
        <>
          <div className="rebalance-header">
            <label>
              Date
              <Field name="date">
                {({ field: { name, value }, form: { setFieldValue } }) => (
                  <input
                    value={value}
                    type="date"
                    onChange={(event) => {
                      handleDateChange(event);
                      setFieldValue(name, event.target.value, false);
                    }}
                  />
                )}
              </Field>
            </label>
            <label>
              Unassigned
              <Amount className="rebalance-unassigned" amount={unassigned} />
            </label>
          </div>
          <ErrorMessage name="date" />
          <Field name="categories">
            {({ field: { name, value }, form: { setFieldValue } }) => (
              <CategoryRebalance
                categoryTree={categoryTree}
                categories={value}
                onDeltaChange={(_amount, delta, categories) => {
                  handleDeltaChange(delta);
                  setFieldValue(name, categories, false);
                }}
              />
            )}
          </Field>
          <ErrorMessage name="categories" />
        </>
      )}
    />
  );
};

RebalanceDialog.propTypes = {
  onClose: PropTypes.func.isRequired,
  onExited: PropTypes.func.isRequired,
  title: PropTypes.string,
  show: PropTypes.bool.isRequired,
  transaction: PropTypes.shape(),
};

RebalanceDialog.defaultProps = {
  transaction: null,
  title: 'Rebalance Categories',
};

export default RebalanceDialog;
