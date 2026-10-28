import React, { useMemo } from 'react';
import {
  Field, FieldProps,
  FormikErrors,
  FormikContextType,
  FormikHelpers,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import {
  FormError, FormField, FormModal, setFormErrors,
} from '@mortvola/forms';
import CategorySplits, { sumSplitCents, type CategorySplitInput } from '../CategorySplits';
import { formatMoneyCents, parseMoneyCents, subtractMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { inputMoneyCents } from '../monetary';
import MoneyCentsAmount from '../MoneyCentsAmount';
import { AccountInterface, TransactionInterface } from '../State/Types';
import AmountInput from '../AmountInput';
import useMediaQuery from '../MediaQuery';
import { AccountType, ApiError, ErrorProps, isApiErrorArray, isErrorPropsArray, RequestErrorCode, TrackingType, TransactionType } from '../../common/ResponseTypes';
import styles from './TransactionDialog.module.scss';
import PurchaseLocation from './PurchaseLocation';
import TransactionTaxCategories, { sumTaxCents, type TransactionTaxInput } from './TransactionTaxCategories';

interface PropsType {
  transaction?: TransactionInterface | null,
  account?: AccountInterface | null,
  onReload?: () => void,
}

const TransactionDialog: React.FC<PropsType & ModalProps> = ({
  setShow,
  transaction = null,
  account = null,
  onReload,
}) => {
  interface ValueType {
    date: string,
    name: string,
    amount: string | number,
    principle?: string | number,
    interest?: string,
    comment: string,
    splits: CategorySplitInput[],
    taxCategories: TransactionTaxInput[],
  }

  const { isMobile } = useMediaQuery();

  const zero = parseMoneyCents('0.00');
  const absoluteCents = (amount: MoneyCents) => amount < 0 ? subtractMoneyCents(zero, amount) : amount;
  const transactionAmountCents = (value: string | number) => inputMoneyCents(value, account?.sign ?? 1);

  const loanInterestCents = (values: ValueType) => subtractMoneyCents(
    transactionAmountCents(values.amount), inputMoneyCents(values.principle ?? '0.00'),
  );

  const computeRemaining = (categories: CategorySplitInput[], total: string | number): MoneyCents => (
    // No explicit splits means the whole transaction belongs to the unassigned category.
    categories.length === 0 ? zero : subtractMoneyCents(absoluteCents(transactionAmountCents(total)), sumSplitCents(categories))
  );

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};
    let amountCents: MoneyCents;
    try {
      amountCents = transactionAmountCents(values.amount);
    }
    catch {
      errors.amount = 'Enter a valid, safe monetary amount.';
      return errors;
    }
    try {
      if (values.splits.length > 0 && sumSplitCents(values.splits) !== absoluteCents(amountCents)) {
        errors.splits = 'The sum of the categories does not match the transaction amount.';
      }
    }
    catch {
      errors.splits = 'Enter valid, safe category amounts.';
    }
    if (account?.type === AccountType.Loan) {
      try { loanInterestCents(values); }
      catch { errors.principle = 'Enter a valid, safe principal amount.'; }
    }
    return errors;
  };

  const handleSubmit = async (values: ValueType, { setErrors }: FormikHelpers<ValueType>) => {
    const amountCents = transactionAmountCents(values.amount);
    const principleCents = values.principle === undefined ? undefined : inputMoneyCents(values.principle);

    // Keep amounts in cents until the state method formats the API request.
    const categories = values.splits.map(({ amount, ...split }) => {
      const cents = inputMoneyCents(amount);
      return { ...split, amountCents: amountCents < 0 ? subtractMoneyCents(zero, cents) : cents };
    });

    let errors: ErrorProps[] | ApiError[] | null;
    if (transaction) {
      errors = await transaction.updateTransaction({
        name: values.name,
        date: values.date,
        amountCents,
        principleCents,
        comment: values.comment,
        categories,
        taxCategories: values.taxCategories.map(({ amount, ...tax }) => ({ ...tax, amountCents: inputMoneyCents(amount) })),
      });
    }
    else {
      if (!account) {
        throw new Error('account is null');
      }

      errors = await account.addTransaction({
        name: values.name,
        date: values.date,
        amountCents,
        principleCents,
        comment: values.comment,
        categories,
      });
    }

    if (errors) {
      const error = errors.find((e) => (e as ApiError).code === RequestErrorCode.INCORRECT_VERSION)

      if (error) {
        setShow(false);

        if (onReload) {
          onReload();
        }
      } else if (isErrorPropsArray(errors)) {
        setFormErrors(setErrors, errors)
      } else if (isApiErrorArray(errors)) {
        const errorProps = errors.map((e) => ({
          // TODO: fix this line so it no longer needs the ''.
          field: e.source?.pointer ?? '',
          message: e.detail,
          rule: e.code,
        }))

        setFormErrors(setErrors, errorProps)
      }
    }
    else {
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

  const splits = useMemo((): CategorySplitInput[] => {
    if (transaction) {
      if (transaction.categories.length > 0) {
        return transaction.categories.map(({ amountCents: _amount, ...c }, index) => ({
          ...c,
          amount: formatMoneyCents(transaction.amountCents < 0
            ? subtractMoneyCents(zero, transaction.getCategoryAmountCents(index))
            : transaction.getCategoryAmountCents(index)),
        }));
      }

      return [];
    }

    return [];
  }, [transaction])

  const taxCategories = useMemo((): TransactionTaxInput[] => {
    if (transaction) {
      if (transaction.taxCategories.length > 0) {
        return transaction.taxCategories.map(({ amountCents: _amount, ...t }, index) => ({
          ...t,
          amount: formatMoneyCents(transaction.getTaxAmountCents(index)),
        }));
      }

      return [];
    }

    return [];
  }, [transaction])

  const splitItemClass = 'transaction-split-item no-balances';

  let paymentChannel = 'unknown';
  if (transaction && transaction.paymentChannel) {
    paymentChannel = transaction.paymentChannel;
  }

  const isReadOnly = () => (
    transaction !== null && transaction.type === TransactionType.REGULAR_TRANSACTION
  );

  const validateSplits = (splits: CategorySplitInput[]) => {
    let error;

    if (splits !== undefined) {
      if (splits.some((split) => split.categoryId === null || split.categoryId === undefined)) {
        error = 'There are one or more items not assigned a category.';
      }
    }

    return error;
  }

  const validateTaxCategories = (taxCategories: TransactionTaxInput[]) => {
    try { sumTaxCents(taxCategories); }
    catch { return 'Enter valid, safe tax amounts.'; }
    return undefined;
  }

  const renderSplits = () => (
    <div className="cat-fund-table">
      <div className={`${splitItemClass}`}>
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
        }: FieldProps<CategorySplitInput[], ValueType>) => {
          let remaining: MoneyCents | null = null;
          let total = zero;
          try {
            total = absoluteCents(transactionAmountCents(values.amount));
            remaining = computeRemaining(value, values.amount);
          }
          catch { /* Form validation reports invalid or unsafe input. */ }
          return (
            <>
              <CategorySplits
                splits={value}
                total={total}
                onChange={(splits) => setFieldValue(name, splits)}
              />
              <div className={splitItemClass}>
                <div className="unassigned-label">Remaining:</div>
                {remaining === null
                  ? <div>Invalid amount</div>
                  : <MoneyCentsAmount amount={remaining} style={{ margin: '1px', padding: '1px' }} />}
              </div>
            </>
          )
        }}
      </Field>
      <FormError name="splits" />
    </div>
  );

  const renderTaxes = () => (
    <div>
      <Field name="taxCategories" validate={validateTaxCategories}>
        {({
          field: {
            value,
            name,
          },
          form: {
            setFieldValue,
          },
        }: FieldProps<TransactionTaxInput[]>) => {
          let total: MoneyCents | null = null;
          try { total = sumTaxCents(value); }
          catch { /* Field validation reports invalid or unsafe input. */ }
          return (
            <>
              <TransactionTaxCategories
                taxCategories={value}
                onChange={(taxes) => setFieldValue(name, taxes)}
              />
              <div className={splitItemClass}>
                <div>Total:</div>
                {total === null ? <div>Invalid amount</div> : <MoneyCentsAmount amount={total} />}
              </div>
            </>
          )
        }}
      </Field>
      <FormError name="taxCategories" />
    </div>
  );

  return (
    <FormModal<ValueType>
      initialValues={{
        date: transaction ? (transaction.date.toISODate() ?? '') : '',
        name: transaction ? transaction.name : '',
        amount: transaction ? formatMoneyCents((account?.sign ?? 1) === -1
          ? subtractMoneyCents(zero, transaction.amountCents) : transaction.amountCents) : '0.00',
        principle: formatMoneyCents(transaction?.principleCents ?? zero),
        interest: formatMoneyCents(transaction
          ? subtractMoneyCents(transaction.amountCents, transaction.principleCents ?? zero) : zero),
        comment: transaction && transaction.comment ? transaction.comment : '',
        splits,
        taxCategories,
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
            account && account.type === AccountType.Loan
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
            ({ field }: FieldProps<string | number, ValueType>) => (
              <AmountInput
                exactCents
                className="form-control"
                readOnly={isReadOnly()}
                {...field}
              />
            )
          }
        </FormField>
        {
          account && account.type === AccountType.Loan
            ? (
              <>
                <FormField
                  name="principle"
                  label="Principle:"
                >
                  {({ field }: FieldProps<string | number, ValueType>) => (
                    <AmountInput exactCents className="form-control" {...field} />
                  )}
                </FormField>
                <FormField
                  name="interest"
                  label="Interest:"
                  readOnly
                >
                  {({ form: { values } }: FieldProps<string, ValueType>) => {
                    try { return <MoneyCentsAmount className="form-control" amount={loanInterestCents(values)} />; }
                    catch { return <div className="form-control">Invalid amount</div>; }
                  }}
                </FormField>
              </>
            )
            : null
        }
        <FormField name="comment" label="Memo:" />
      </div>
      {
        account === null || account.tracking === TrackingType.Transactions
          ? renderSplits()
          : null
      }
      {
        account === null || account.tracking === TrackingType.Transactions
          ? renderTaxes()
          : null
      }
    </FormModal>
  );
};

export const useTransactionDialog = makeUseModal<PropsType>(TransactionDialog, { size: 'lg' });
