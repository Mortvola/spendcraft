import React from 'react';
import { Modal, Button } from 'react-bootstrap';
import {
  Formik, Form, Field, ErrorMessage, FormikErrors, FieldProps, FormikProps,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { SubmitButton } from '@mortvola/forms';
import Http from '@mortvola/http';
import { formatMoneyCents, parseMoneyCents, subtractMoneyCents } from '../common/moneyCents';
import { inputMoneyCents, encodeTransferCategories } from './monetary';
import CategorySplits, { sumSplitCents, type CategorySplitInput } from './CategorySplits';
import MoneyCentsAmount from './MoneyCentsAmount';
import Transaction from './State/Transaction';

const Header: React.FC = () => (
  <Modal.Header closeButton>
    <h4 id="modalTitle" className="modal-title">Category Transfer</h4>
  </Modal.Header>
);

interface FooterPropsType {
  setShow: (show: boolean) => void,
  isSubmitting: boolean,
}

const Footer: React.FC<FooterPropsType> = ({ setShow, isSubmitting }) => (
  <Modal.Footer>
    <div />
    <div />
    <Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button>
    <SubmitButton
      isSubmitting={isSubmitting}
      label="Save"
      submitLabel="Saving"
    />
  </Modal.Footer>
);

interface PropsType {
  transaction?: Transaction | null,
}

const CategoryTransferDialog: React.FC<PropsType & ModalProps> = ({
  setShow,
  transaction = null,
}) => {
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

  interface ValueType {
    fromCategories: CategorySplitInput[],
    toCategories: CategorySplitInput[],
    date: string | null,
  }

  const validateSplits = (splits: CategorySplitInput[]) => {
    let error;

    if (splits.length === 0 || splits.some((split) => (
      split.categoryId === null || split.categoryId === undefined
    ))) {
      error = 'There are one or more items not assigned a category.';
    }

    if (!error) {
      try { sumSplitCents(splits); }
      catch { error = 'Enter valid, safe transfer amounts.'; }
    }
    return error;
  }

  const totals = (values: ValueType) => {
    const from = sumSplitCents(values.fromCategories);
    const to = sumSplitCents(values.toCategories);
    return { from, to, difference: subtractMoneyCents(from, to) };
  };

  const handleSubmit = async (values: ValueType) => {
    const { date, fromCategories, toCategories } = values;
    const encodeSide = (splits: CategorySplitInput[], sign: number) => encodeTransferCategories(
      splits.map((split) => {
      if (split.categoryId === undefined) throw new Error('missing category');
      if (split.id === undefined) throw new Error('missing id');
      const { id, ...category } = split;
      return {
        ...category,
        ...(id < 0 ? {} : { id }),
        amount: formatMoneyCents(sign === -1
          ? subtractMoneyCents(parseMoneyCents('0.00'), inputMoneyCents(split
            .amount)) : inputMoneyCents(split.amount)),
      };
    }));
    const cats = [...encodeSide(fromCategories, -1), ...encodeSide(toCategories, 1)];

    if (transaction) {
      const response = await Http.patch(`/api/v1/category-transfer/${transaction.id}`,
        { date, categories: cats });

      if (response.ok) {
        setShow(false);
      }
    }
    else {
      const response = await Http.post('/api/v1/category-transfer',
        { date, categories: cats });

      if (response.ok) {
        setShow(false);
      }
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};
    try {
      if (totals(values).difference !== 0) {
        errors.fromCategories =
          'The sum of the From categories does not match the sum of the To categories.';
      }
    }
    catch {
      errors.fromCategories = 'Enter valid, safe transfer amounts.';
    }

    return errors;
  };

  const initialSplits = (from: boolean): CategorySplitInput[] => transaction
    ? transaction.categories.flatMap(({ amountCents: _amount, ...category }, index) => {
      const amount = transaction.getCategoryAmountCents(index);
      if ((amount < 0) !== from) return [];
      return [{ ...category, amount: formatMoneyCents(from
        ? subtractMoneyCents(parseMoneyCents('0.00'), amount) : amount) }];
    }) : [];

  return (
    <Formik<ValueType>
      initialValues={{
        fromCategories: initialSplits(true),
        toCategories: initialSplits(false),
        date: transaction ? transaction.date.toISODate() : null,
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
    >
      {
        ({ isSubmitting, values }: FormikProps<ValueType>) => {
          let amounts: ReturnType<typeof totals> | null = null;
          try { amounts = totals(values); }
          catch { /* Validation reports invalid or unsafe amounts. */ }
          return (
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
                    }: FieldProps<CategorySplitInput[]>) => (
                      <CategorySplits
                        splits={value}
                        total={parseMoneyCents('0.00')}
                        onChange={(splits) => setFieldValue(name, splits)}
                      />
                    )}
                  </Field>
                  <label>
                    Transfer Total
                    {amounts === null ? <div>Invalid amount</div>
                      : <MoneyCentsAmount className="transfer-total splits-total" amount={amounts
                        .from} />}
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
                  }: FieldProps<CategorySplitInput[]>) => (
                    <CategorySplits
                      splits={value}
                      total={parseMoneyCents('0.00')}
                      onChange={(splits) => setFieldValue(name, splits)}
                    />
                  )}
                </Field>
                <label>
                  Transfer Total
                  {amounts === null ? <div>Invalid amount</div>
                    : <MoneyCentsAmount className="splits-total" amount={amounts.to} />}
                </label>
                <label>
                  Unassigned
                  {amounts === null ? <div>Invalid amount</div>
                    : <MoneyCentsAmount className="available-funds splits-total" amount={amounts
                      .difference} />}
                </label>
              </div>
              <ErrorMessage name="fromCategories" />
              <ErrorMessage name="toCategories" />
              <Footer setShow={setShow} isSubmitting={isSubmitting} />
            </Form>
          );
        }
      }
    </Formik>
  );
};

export const useCategoryTransferDialog = makeUseModal<PropsType>(CategoryTransferDialog);
