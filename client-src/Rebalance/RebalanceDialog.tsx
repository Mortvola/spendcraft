import { decodeAmount, inputMoneyCents } from '../monetary';
import { formatMoneyCents, parseMoneyCents, subtractMoneyCents } from '../../common/moneyCents';
import { sumSplitCents, type CategorySplitInput } from '../CategorySplits';
import React, {
  useState, useEffect, useCallback,
} from 'react';
import {
  Field, FormikErrors,
  FieldProps,
  FormikContextType,
} from 'formik';
import { DateTime } from 'luxon';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import Http from '@mortvola/http';
import { FormModal, FormError, setFormErrors } from '@mortvola/forms';
import CategoryRebalance from './CategoryRebalance';
import MoneyCentsAmount from '../MoneyCentsAmount';
import Transaction from '../State/Transaction';
import { type CategoryBalanceInterface } from '../State/Types';
import { useStores } from '../State/Store';
import { isCategoryTreeBalanceResponse, TransactionType } from '../../common/ResponseTypes';

interface PropsType {
  transaction?: Transaction,
}

const RebalanceDialog: React.FC<PropsType & ModalProps> = ({
  transaction,
  setShow,
}) => {
  const { register } = useStores();
  const [balances, setBalances] = useState<CategoryBalanceInterface[]>([])
  const [date, setDate] = useState(transaction ? transaction.date.toISODate() : DateTime.now().toISODate());

  interface ValueType {
    categories: CategorySplitInput[]
    date: string,
  }

  const fetchCategoryBalances = useCallback((fetchDate: string) => {
    if (fetchDate !== '') {
      const params: Record<string, string> = { date: fetchDate };
      if (transaction && transaction.id !== null) {
        params.id = transaction.id.toString();
      }

      const url = new URL('/api/v1/category-balances', window.location.href);
      url.search = (new URLSearchParams(params)).toString();

      (async () => {
        const response = await Http.get(url.toString());

        if (response.ok) {
          const body = await response.body();

          if (isCategoryTreeBalanceResponse(body)) {
            setBalances(body.map((row) => ({ id: row.id, balanceCents: parseMoneyCents(row.balance) })));
          }
        }
      })();
    }
  }, [transaction]);

  useEffect(() => {
    fetchCategoryBalances(date ?? '');
  }, [date, fetchCategoryBalances]);

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDate(event.target.value);
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.date === '') {
      errors.date = 'A date must be specified.';
    }

    if (values.categories.length === 0) {
      errors.categories = 'There must be at least one adjustment.';
    }
    else {
      try {
        if (sumSplitCents(values.categories) !== 0) {
          errors.categories = 'The sum of the adjustments must be zero.';
        }
      }
      catch {
        errors.categories = 'Enter valid, safe adjustment amounts.';
      }
    }

    return errors;
  };

  const handleSubmit = async (values: ValueType) => {
    // Adapt only at the existing numeric state-method boundary.
    const request = { ...values, categories: values.categories.map(category => ({
      ...category, amount: decodeAmount(formatMoneyCents(inputMoneyCents(category.amount))),
    })) };
    if (transaction) {
      const errors = await transaction.updateCategoryTransfer(request);

      if (!errors) {
        setShow(false);
      }
    }
    else {
      const errors = await register.addCategoryTransfer(request, TransactionType.REBALANCE_TRANSACTION);

      if (!errors) {
        setShow(false);
      }
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
    }
  };

  return (
    <FormModal<ValueType>
      setShow={setShow}
      initialValues={{
        categories:
          transaction
            ? transaction.categories.map((category, index) => ({
              ...category, amount: formatMoneyCents(transaction.getCategoryAmountCents(index)),
            }))
            : [],
        date: date ?? '',
      }}
      title="Rebalance Categories"
      formId="rebalanceForm"
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={transaction ? handleDelete : null}
    >
      <div className="rebalance-container">
        <div className="rebalance-header">
          <label>
            Date:
            <Field name="date">
              {({
                field: {
                  name,
                  value,
                },
                form: {
                  setFieldValue,
                },
              }: FieldProps<string>) => (
                <input
                  className="form-control"
                  value={value}
                  type="date"
                  onChange={(event) => {
                    handleDateChange(event);
                    setFieldValue(name, event.target.value, false);
                  }}
                />
              )}
            </Field>
            <FormError name="date" />
          </label>
          <label>
            Unassigned:
            <Field name="categories">
              {({ field: { value } }: FieldProps<CategorySplitInput[]>) => {
                try {
                  return <MoneyCentsAmount className="form-control" amount={subtractMoneyCents(parseMoneyCents('0.00'), sumSplitCents(value))} />;
                }
                catch { return <div>Invalid amount</div>; }
              }}
            </Field>
          </label>
        </div>
        <FormError name="categories" />
        <Field name="categories">
          {({
            field: {
              name,
              value,
            },
            form: {
              setFieldValue,
            },
          }: FieldProps<CategorySplitInput[]>) => (
            <CategoryRebalance
              trxCategories={value}
              balances={balances}
              onChange={(categories) => setFieldValue(name, categories)}
            />
          )}
        </Field>
      </div>
    </FormModal>
  );
};

export const useRebalanceDialog = makeUseModal<PropsType>(RebalanceDialog, { size: 'lg' });
