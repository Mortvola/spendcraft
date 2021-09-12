/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement } from 'react';
import { Modal, Button } from 'react-bootstrap';
import {
  Formik, Form, Field, ErrorMessage, FormikErrors, FieldProps,
} from 'formik';
import CategorySplits from './CategorySplits';
import useModal, { ModalProps } from './Modal/useModal';
import Transaction from './State/Transaction';
import { httpPatch, httpPost, httpDelete } from './State/Transports';
import { TransactionCategoryInterface } from './State/State';

type PropsType = {
  transaction?: Transaction | null,
  onHide?: () => void,
}

const CategoryTransferDialog = ({
  onHide,
  show,
  setShow,
  transaction = null,
}: PropsType & ModalProps): ReactElement => {
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

  // const toCatSplits = new CategorySplits(
  //   $('#catTransferForm .available-funds'),
  //   $('#catTransferForm .to-split-items'),
  //   amount, toCats, false,
  // );

  // const fromCatSplits = new CategorySplits(
  //   $('#catTransferForm .transfer-total'),
  //   $('#catTransferForm .from-split-items'),
  //   amount, fromCats, true, -1,
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

  type ValueType = {
    fromCategories: Array<TransactionCategoryInterface | { id: number, amount: number }>,
    toCategories: Array<TransactionCategoryInterface | { id: number, amount: number }>,
    date: string | null,
  }

  function validateSplits(splits: Array<TransactionCategoryInterface>) {
    let error;

    if (splits !== undefined && splits.length > 0) {
      if (splits.some((split) => (
        split.categoryId === null || split.categoryId === undefined
      ))) {
        error = 'There are one or more items not assigned a category.';
      }
    }

    return error;
  }

  const handleSubmit = async (values: ValueType) => {
    const { date, fromCategories, toCategories } = values;
    const cats = fromCategories.concat(toCategories).map((s) => {
      if (s.id === undefined) {
        throw new Error('missing id');
      }
      if (s.id < 0) {
        const { id, ...newSplit } = s;

        return newSplit;
      }

      return s;
    });

    if (transaction) {
      const response = await httpPatch(`/api/category-transfer/${transaction.id}`,
        { date, categories: cats });

      if (response.ok) {
        setShow(false);
      }
    }
    else {
      const response = await httpPost('/api/category-transfer',
        { date, categories: cats });

      if (response.ok) {
        setShow(false);
      }
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};
    const fromSum = values.fromCategories.reduce(
      (accum, item) => accum + Math.floor(item.amount * -100), 0,
    );
    const toSum = values.toCategories.reduce(
      (accum, item) => accum + Math.floor(item.amount * 100), 0,
    );

    if (fromSum !== toSum) {
      errors.fromCategories = 'The sum of the From categories does not match the sum of the To categories.';
    }

    return errors;
  };

  const handleTotalChange = () => null;

  const handleDelete = async () => {
    if (!transaction) {
      throw new Error('transaction is null');
    }

    await httpDelete(`/api/category-transfer/${transaction.id}`);

    setShow(false);
  };

  const Header = () => (
    <Modal.Header closeButton>
      <h4 id="modalTitle" className="modal-title">Category Transfer</h4>
    </Modal.Header>
  );

  const Footer = () => (
    <Modal.Footer>
      <div />
      <div />
      <Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button>
      <Button variant="primary" type="submit">Save</Button>
    </Modal.Footer>
  );

  return (
    <Modal
      onDelete={transaction
        ? handleDelete
        : undefined}
      show={show}
      onHide={onHide}
      size="lg"
    >
      <Formik<ValueType>
        initialValues={{
          fromCategories: transaction && transaction.categories
            ? transaction.categories.filter((c) => c.amount < 0)
            : [{ id: -1, amount: 0 }],
          toCategories: transaction && transaction.categories
            ? transaction.categories.filter((c) => c.amount >= 0)
            : [{ id: -1, amount: 0 }],
          date: transaction ? transaction.date : null,
        }}
        validate={handleValidate}
        onSubmit={handleSubmit}
      >
        <Form id="catTransferForm" className="scrollable-form">
          <Header />
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
                    splits={value.map((s) => (
                      { ...s, ...{ amount: s.amount * -1 } }
                    ))}
                    total={0}
                    onChange={(splits) => {
                      setFieldValue(name, splits.map((s) => (
                        { ...s, ...{ amount: s.amount * -1 } }
                      )));
                      handleTotalChange();
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
                  total={0}
                  onChange={(splits) => {
                    setFieldValue(name, splits);
                    handleTotalChange();
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
          <Footer />
        </Form>
      </Formik>
    </Modal>
  );
};

export const useCategoryTransferDialog = () => useModal(CategoryTransferDialog);

export default CategoryTransferDialog;
