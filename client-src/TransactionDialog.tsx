/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement, useState } from 'react';
import {
  Field, ErrorMessage, FieldProps,
  FormikErrors,
} from 'formik';
import CategorySplits from './CategorySplits';
import useModal, { ModalProps } from './Modal/useModal';
import Amount from './Amount';
import Transaction from './state/Transaction';
import { CategoryInterface, TransactionCategoryInterface } from './state/State';
import FormError from './Modal/FormError';
import AmountInput from './AmountInput';
import FormModal from './Modal/FormModal';

function validateSplits(splits: Array<TransactionCategoryInterface>) {
  let error;

  if (splits !== undefined) {
    if (splits.some((split) => split.categoryId === null || split.categoryId === undefined)) {
      error = 'There are one or more items not assigned a category.';
    }
  }

  return error;
}

type PropsType = {
  transaction: Transaction,
  category?: CategoryInterface | null,
  unassignedId: number,
}

const TransactionDialog = ({
  show,
  onHide,
  transaction,
  category,
  unassignedId,
}: PropsType & ModalProps): ReactElement => {
  const showBalances = category ? category.id === unassignedId : false;

  type ValueType = {
    date: string,
    name: string,
    amount: number,
    splits: TransactionCategoryInterface[],
  }

  const computeRemaining = (categories: TransactionCategoryInterface[], total: number, sign = 1) => {
    let sum = 0;
    if (categories) {
      sum = categories.reduce((accum: number, item) => {
        if (item.categoryId !== undefined && item.categoryId !== unassignedId) {
          return accum + item.amount;
        }

        return accum;
      }, 0);
    }

    return Math.abs(total) - sign * sum;
  };

  const [remaining, setRemaining] = useState(
    computeRemaining(transaction.categories, transaction.amount, Math.sign(transaction.amount)),
  );

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.splits.length > 0) {
      const sum = values.splits.reduce(
        (accum: number, item: TransactionCategoryInterface) => accum + Math.round(item.amount * 100),
        0,
      );
  
      if (sum !== Math.abs(Math.round(values.amount * 100))) {
        errors.splits = 'The sum of the categories does not match the transaction amount.';
      }
    }

    return errors;
  };

  const handleSubmit = async (values: ValueType) => {
    const amount = typeof values.amount === 'string' ? parseFloat(values.amount) : values.amount;

    // If the transaction amount is less then zero then
    // negate all of the category amounts.
    if (amount < 0) {
      values.splits.forEach((element) => {
        element.amount *= -1;
      });
    }

    const errors = await transaction.updateTransaction({
      name: values.name,
      date: values.date,
      amount,
      splits: values.splits,
    });

    if (!errors) {
      onHide();
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

  let splitItemClass = 'transaction-split-item';
  if (!showBalances) {
    splitItemClass += ' no-balances';
  }

  // && transaction.categories.length > 0
  // ? transaction.categories.map((c) => ({
  //   ...c,
  //   amount: c.amount * Math.sign(transaction.amount),
  // }))
  // : [{ amount: Math.abs(transaction.amount) }],

  return (
    <FormModal<ValueType>
      initialValues={{
        date: transaction.date,
        name: transaction.name,
        amount: transaction.amount,
        splits: transaction.categories.map((c) => ({
          ...c,
          amount: transaction.amount < 0 ? -c.amount : c.amount,
        })),
      }}
      show={show}
      onHide={onHide}
      size={showBalances ? 'lg' : undefined}
      title="Transaction"
      formId="transactionDialogForm"
      validate={handleValidate}
      onSubmit={handleSubmit}
    >
      <label>
        Date:
        <Field className="form-control" type="date" name="date" />
      </label>
      <label>
        Name:
        <Field
          type="text"
          className="form-control"
          name="name"
        />
        <FormError name="name" />
      </label>
      <label>
        Amount:
        <Field
          name="amount"
        >
          {
            ({ field, form: { values, touched }, meta }: FieldProps<string | number, ValueType>) => (
              <AmountInput
                className="form-control"
                {...field}
                onBlur={(v) => {
                  setRemaining(computeRemaining(values.splits, parseFloat(v.target.value)));
                }}
              />
            )
          }
        </Field>
        <FormError name="amount" />
      </label>
      <div className="cat-fund-table">
        <div className={`${splitItemClass} cat-fund-title`}>
          <div className="fund-list-cat-name">Category</div>
          <div className="dollar-amount">Amount</div>
          {renderBalanceHeaders()}
        </div>
        <Field name="splits" validate={validateSplits}>
          {({
            field: {
              value,
              name,
            },
            form: {
              setFieldValue,
              values,
            },
          }: FieldProps<TransactionCategoryInterface[]>) => (
            <CategorySplits
              splits={value}
              total={Math.abs(typeof(values.amount) === 'string' ? parseFloat(values.amount) : values.amount)}
              showBalances={showBalances}
              onChange={(splits) => {
                setFieldValue(name, splits);
                setRemaining(computeRemaining(splits, typeof(values.amount) === 'string' ? parseFloat(values.amount) : values.amount));
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
    </FormModal>
  );
};

TransactionDialog.defaultProps = {
  category: null,
};

export const useTransactionDialog = (): [
  (props: PropsType) => (ReactElement | null),
  () => void,
] => useModal<PropsType>(TransactionDialog);

export default TransactionDialog;
