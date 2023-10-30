/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useMemo, useState } from 'react';
import {
  Field, FieldProps,
  FormikErrors,
  FormikContextType,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import {
  FormError, FormField, FormModal, setFormErrors,
} from '@mortvola/forms';
import CategorySplits from '../CategorySplits';
import Amount from '../Amount';
import { AccountInterface, TransactionCategoryInterface, TransactionInterface } from '../State/State';
import AmountInput from '../AmountInput';
import useMediaQuery from '../MediaQuery';
import { TransactionType } from '../../common/ResponseTypes';
import styles from './TransactionDialog.module.scss';
import PurchaseLocation from './PurchaseLocation';

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
  transaction?: TransactionInterface | null,
  account?: AccountInterface | null,
}

const TransactionDialog: React.FC<PropsType & ModalProps> = ({
  setShow,
  transaction = null,
  account = null,
}) => {
  type ValueType = {
    date: string,
    name: string,
    amount: number,
    principle?: number,
    interest?: number,
    comment: string,
    splits: TransactionCategoryInterface[],
  }

  const { isMobile } = useMediaQuery();

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
    const principle = typeof values.principle === 'string' ? parseFloat(values.principle) : values.principle;

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
        principle,
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
        principle,
        comment: values.comment,
        splits: values.splits,
      });
    }

    if (!errors) {
      setShow(false);
    }
  };

  const handleDelete = async (bag: FormikContextType<ValueType>) => {
    const { setTouched, setErrors } = bag;

    if (transaction) {
      const errors = await transaction.delete();

      if (errors && errors.length > 0) {
        setTouched({ [errors[0].field]: true }, false);
        setFormErrors(setErrors, errors);
      }
      else {
        setShow(false);
      }
    }
  };

  const splits = useMemo((): TransactionCategoryInterface[] => {
    if (transaction) {
      if (transaction.categories.length > 0) {
        return transaction.categories.map((c) => ({
          ...c,
          amount: transaction.amount < 0 ? -c.amount : c.amount,
        }));
      }

      return [];
    }

    return [];
  }, [transaction])

  const [remaining, setRemaining] = useState(() => {
    if (transaction) {
      return computeRemaining(splits, transaction.amount);
    }

    return 0;
  });

  const splitItemClass = 'transaction-split-item no-balances';

  let paymentChannel = 'unknown';
  if (transaction && transaction.paymentChannel) {
    paymentChannel = transaction.paymentChannel;
  }

  const isReadOnly = () => (
    transaction !== null && transaction.type === TransactionType.REGULAR_TRANSACTION
  );

  const renderSplits = () => (
    <div className="cat-fund-table">
      <div className={`${splitItemClass} cat-fund-title`}>
        <div className="item-title">Category</div>
        <div className="item-title-amount">Amount</div>
        {
          !isMobile
            ? <div className="item-title">Comment</div>
            : null
        }
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
          )
        }}
      </Field>
      <div className={splitItemClass}>
        <div className="unassigned-label">Remaining:</div>
        <Amount amount={remaining} style={{ margin: '1px', padding: '1px' }} />
      </div>
      <FormError name="splits" />
    </div>
  );

  return (
    <FormModal<ValueType>
      initialValues={{
        date: transaction ? (transaction.date.toISODate() ?? '') : '',
        name: transaction ? transaction.name : '',
        amount: transaction ? transaction.amount : 0,
        principle: transaction ? (transaction.principle ?? 0) : 0,
        interest: transaction ? (transaction.amount - (transaction.principle ?? 0)) : 0,
        comment: transaction && transaction.comment ? transaction.comment : '',
        splits,
      }}
      setShow={setShow}
      title={transaction ? 'Edit Transaction' : 'Add Transaction'}
      formId="transactionDialogForm"
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={transaction && transaction.type !== TransactionType.STARTING_BALANCE ? handleDelete : null}
    >
      <div className={styles.main}>
        <FormField name="date" type="date" label="Date:" readOnly={isReadOnly()} />
        {
          transaction !== null
            ? (
              <div>
                <div>{`Payment Channel: ${paymentChannel}`}</div>
                {
                  transaction.location
                    ? <PurchaseLocation location={transaction.location} />
                    : null
                }
              </div>
            )
            : null
        }
      </div>
      <FormField
        name="name"
        label="Name:"
        readOnly={isReadOnly()}
        style={{ width: '100%' }}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            account && account.type === 'loan'
              ? 'minmax(0, 8rem) minmax(0, 8rem) minmax(0, 8rem) minmax(0, 1fr)'
              : 'minmax(0, 8rem) minmax(0, 1fr)',
          columnGap: '1rem',
        }}
      >
        <FormField
          name="amount"
          label="Amount:"
          readOnly={isReadOnly()}
        >
          {
            ({ field, form: { values } }: FieldProps<string | number, ValueType>) => (
              <AmountInput
                className="form-control"
                readOnly={isReadOnly()}
                {...field}
                onBlur={(v) => {
                  setRemaining(computeRemaining(values.splits, parseFloat(v.target.value)));
                }}
              />
            )
          }
        </FormField>
        {
          account && account.type === 'loan'
            ? (
              <>
                <FormField
                  name="principle"
                  label="Principle:"
                  as={AmountInput}
                  onBlur={() => console.log('principle blur')}
                />
                <FormField
                  name="interest"
                  label="Interest:"
                  as={AmountInput}
                  onBlur={() => console.log('interest blur')}
                  readOnly
                />
              </>
            )
            : null
        }
        <FormField name="comment" label="Memo:" />
      </div>
      {
        account === null || account.tracking === 'Transactions'
          ? renderSplits()
          : null
      }
    </FormModal>
  );
};

export const useTransactionDialog = makeUseModal<PropsType>(TransactionDialog, { size: 'lg' });

export default TransactionDialog;
