/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement, useState } from 'react';
// import PropTypes from 'prop-types';
import {
  Field, ErrorMessage, FieldProps,
  Formik, Form, FormikErrors,
} from 'formik';
import { Button, Modal, ModalBody } from 'react-bootstrap';
import CategorySplits from './CategorySplits';
import useModal, { ModalProps } from './Modal/useModal';
import Amount from './Amount';
import Transaction from './state/Transaction';
import { CategoryInterface, TransactionCategoryInterface } from './state/State';

function validateSplits(splits: Array<TransactionCategoryInterface>) {
  let error;

  if (splits !== undefined) {
    if (splits.some((split) => split.categoryId === null || split.categoryId === undefined)) {
      error = 'There are one or more items not assigned a category.';
    }
  }

  return error;
}

interface Props {
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
}: Props & ModalProps): ReactElement => {
  const showBalances = category ? category.id === unassignedId : false;

  type ValueType = {
    splits: Array<TransactionCategoryInterface>,
  }

  const computeRemaining = (categories: Array<TransactionCategoryInterface>, sign = 1) => {
    let sum = 0;
    if (categories) {
      sum = categories.reduce((accum: number, item) => {
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

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};
    const sum = values.splits.reduce(
      (accum: number, item: TransactionCategoryInterface) => accum + Math.round(item.amount * 100),
      0,
    );

    if (sum !== Math.abs(Math.round(transaction.amount * 100))) {
      errors.splits = 'The sum of the categories does not match the transaction amount.';
    }

    return errors;
  };

  const handleSubmit = async (values: ValueType) => {
    // If the transaction amount is less then zero then
    // negate all of the category amounts.
    if (transaction.amount < 0) {
      values.splits.forEach((element) => {
        element.amount *= -1;
      });
    }

    const errors = await transaction.updateTransactionCategories(values.splits);

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

  const Header = () => (
    <Modal.Header closeButton>
      <h4 id="modalTitle" className="modal-title">Transaction Categories</h4>
    </Modal.Header>
  );

  const Footer = () => (
    <Modal.Footer>
      <div />
      <div />
      <Button variant="secondary" onClick={onHide}>Cancel</Button>
      <Button variant="primary" type="submit">Save</Button>
    </Modal.Footer>
  );

  return (
    <Modal
      show={show}
      onHide={onHide}
      size={showBalances ? 'lg' : undefined}
      enforceFocus={false}
    >
      <Formik<ValueType>
        initialValues={{
          splits: transaction.categories,
        }}
        validate={handleValidate}
        onSubmit={handleSubmit}
      >
        <Form id="transactionDialogForm" className="scrollable-form">
          <Header />
          <ModalBody>
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
                  },
                }: FieldProps<Array<TransactionCategoryInterface>>) => (
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
          </ModalBody>
          <Footer />
        </Form>
      </Formik>
    </Modal>
  );
};

TransactionDialog.defaultProps = {
  category: null,
};

export const useTransactionDialog = (): [
  (props: Props) => (ReactElement | null),
  () => void,
] => useModal<Props>(TransactionDialog);

export default TransactionDialog;
