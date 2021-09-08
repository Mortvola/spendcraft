import React, {
  ChangeEvent,
  ReactElement, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Field, FieldProps, Form,
  FormikErrors,
  Formik,
} from 'formik';
import FormError from '../Modal/FormError';
import AmountInput from '../AmountInput';
import { AccountInterface, TransactionCategoryInterface, TransactionInterface } from '../state/State';
import Amount from '../Amount';
import CategorySplits from '../CategorySplits';
import FormField from '../Modal/FormField'

type PropsType = {
  transaction?: TransactionInterface | null,
  account?: AccountInterface | null,
}

const TransactionForm = ({
  transaction = null,
  account = null,
}: PropsType): ReactElement => {
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  })

  type ValueType = {
    date: string,
    name: string,
    amount: number,
    comment: string,
    splits: TransactionCategoryInterface[],
  }

  const computeRemaining = (categories: TransactionCategoryInterface[], total: number) => {
    let sum = 0;
    if (categories && categories.length > 0) {
      sum = categories.reduce((accum: number, item) => (
        accum + item.amount
      ), 0);

      return Math.abs(total) - sum;
    }

    // If there are no categories, assume the transaction total is assigned to a single
    // unassigned item.
    return 0;
  };

  const [remaining, setRemaining] = useState(() => {
    if (transaction) {
      return computeRemaining(transaction.categories, transaction.amount);
    }

    return 0;
  });

  const validateSplits = (splits: TransactionCategoryInterface[]) => {
    let error;

    if (splits !== undefined) {
      if (splits.some((split) => split.categoryId === null || split.categoryId === undefined)) {
        error = 'There are one or more items not assigned a category.';
      }
    }

    return error;
  }

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

    let errors;
    if (transaction) {
      errors = await transaction.updateTransaction({
        name: values.name,
        date: values.date,
        amount,
        comment: values.comment,
        splits: values.splits,
      });
    }
    else {
      if (!account) {
        throw new Error('account is null');
      }

      errors = await account.addTransaction({
        name: values.name,
        date: values.date,
        amount,
        comment: values.comment,
        splits: values.splits,
      });
    }

    // if (!errors) {
    //   setShow(false);
    // }
  };

  const splits = useMemo((): TransactionCategoryInterface[] => {
    if (transaction) {
      if (transaction.categories.length > 0) {
        return transaction.categories.map((c) => ({
          ...c,
          amount: transaction.amount < 0 ? -c.amount : c.amount,
        }));
      }

      // return [{
      //   id: -1,
      //   type: 'UNASSIGNED',
      //   categoryId: 0,
      //   amount: transaction.amount < 0 ? -transaction.amount : transaction.amount,
      // }]
      return [];
    }

    return [];
  }, [transaction])

  const splitItemClass = 'transaction-split-item no-balances';

  let paymentChannel = 'unknown';
  if (transaction && transaction.paymentChannel) {
    paymentChannel = transaction.paymentChannel;
  }

  return (
    <Formik<ValueType>
      initialValues={{
        date: transaction ? transaction.date : '',
        name: transaction ? transaction.name : '',
        amount: transaction ? transaction.amount : 0,
        comment: transaction && transaction.comment ? transaction.comment : '',
        // eslint-disable-next-line no-nested-ternary
        splits,
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
    >
      <Form className="scrollable-form" ref={ref}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <FormField name="date" label="Date:" type="date" />
          <div>{`Payment Channel: ${paymentChannel}`}</div>
        </div>
        <FormField name="name" label="Name:" />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 8rem) minmax(0, 1fr)',
          columnGap: '1rem',
        }}
        >
          <FormField<string | number, ValueType>
            name="amount"
            label="Amount:"
            as={AmountInput}
            onChange={(
              event: ChangeEvent<HTMLInputElement>,
              { form: { values } }: FieldProps<string | number, ValueType>,
            ) => {
              const amount = parseFloat(event.target.value);
              setRemaining(computeRemaining(values.splits, amount));
            }}
          />
          <FormField name="comment" label="Memo:" />
        </div>
        {
          account === null || account.tracking === 'Transactions'
            ? (
              <div className="cat-fund-table">
                <div className={`${splitItemClass} cat-fund-title`}>
                  <div className="item-title">Category</div>
                  <div className="item-title-amount">Amount</div>
                  <div className="item-title">Comment</div>
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
                  }: FieldProps<TransactionCategoryInterface[]>) => {
                    const amount = typeof (values.amount) === 'string' ? parseFloat(values.amount) : values.amount;
                    return (
                      <CategorySplits
                        splits={value}
                        total={Math.abs(amount)}
                        onChange={(s) => {
                          setFieldValue(name, s);
                          setRemaining(computeRemaining(s, amount));
                        }}
                      />
                    );
                  }}
                </Field>
                <div className={splitItemClass}>
                  <div className="unassigned-label">Remaining:</div>
                  <Amount amount={remaining} style={{ margin: '1px', padding: '1px' }} />
                </div>
                <FormError name="splits" />
              </div>
            )
            : null
        }
      </Form>
    </Formik>
  )
}

export default TransactionForm;
