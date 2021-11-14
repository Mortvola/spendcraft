/* eslint-disable jsx-a11y/label-has-associated-control */
import React, {
  useState, useEffect, useCallback, ReactElement, useContext,
} from 'react';
import {
  Field, FormikErrors,
  FieldProps,
  FormikContextType,
} from 'formik';
import { toJS } from 'mobx';
import { DateTime } from 'luxon';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import Http from '@mortvola/http';
import CategoryRebalance from './CategoryRebalance';
import Amount from '../Amount';
import Transaction from '../State/Transaction';
import { CategoryBalanceInterface, TransactionCategoryInterface } from '../State/State';
import MobxStore from '../State/mobxStore';
import FormModal from '../Modal/FormModal';
import { isCategoryTreeBalanceResponse, TransactionType } from '../../common/ResponseTypes';
import FormError from '../Modal/FormError';
import { setFormErrors } from '../Modal/Errors';

interface Props {
  transaction?: Transaction,
}

const RebalanceDialog = ({
  transaction,
  setShow,
}: Props & ModalProps): ReactElement => {
  const { register, categoryTree: { nodes } } = useContext(MobxStore);
  const [balances, setBalances] = useState<CategoryBalanceInterface[]>([])
  const [unassigned, setUnassigned] = useState(0);
  const [date, setDate] = useState(transaction ? transaction.date.toISODate() : DateTime.now().toISODate());

  type ValueType = {
    categories: TransactionCategoryInterface[]
    date: string,
  }

  const fetchCategoryBalances = useCallback((fetchDate: string) => {
    if (fetchDate !== '') {
      const params: Record<string, string> = { date: fetchDate };
      if (transaction && transaction.id !== null) {
        params.id = transaction.id.toString();
      }

      const url = new URL('/api/category-balances', window.location.href);
      url.search = (new URLSearchParams(params)).toString();

      (async () => {
        const response = await Http.get(url.toString());

        if (response.ok) {
          const body = await response.body();

          if (isCategoryTreeBalanceResponse(body)) {
            setBalances(body);
          }
        }
      })();
    }
  }, [transaction]);

  useEffect(() => {
    fetchCategoryBalances(date);
  }, [date, fetchCategoryBalances]);

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDate(event.target.value);
  };

  const handleDeltaChange = (delta: number) => {
    setUnassigned(unassigned - delta);
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
      const sum = values.categories.reduce((accumulator, currentValue) => (
        accumulator + Math.round(currentValue.amount * 100)
      ), 0);

      if (sum !== 0) {
        errors.categories = 'The sum of the adjustments must be zero.';
      }
    }

    return errors;
  };

  const handleSubmit = async (values: ValueType) => {
    // const { setErrors } = bag;
    if (transaction) {
      const errors = await transaction.updateCategoryTransfer(values);

      if (!errors) {
        setShow(false);
      }
    }
    else {
      const errors = await register.addCategoryTransfer(values, TransactionType.REBALANCE_TRANSACTION);

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
        categories: transaction ? toJS(transaction.categories) : [],
        date,
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
            <Amount className="form-control" amount={unassigned} />
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
          }: FieldProps<TransactionCategoryInterface[]>) => (
            <CategoryRebalance
              nodes={nodes}
              trxCategories={value}
              balances={balances}
              onDeltaChange={(_amount, delta, categories) => {
                handleDeltaChange(delta);
                setFieldValue(name, categories, false);
              }}
            />
          )}
        </Field>
      </div>
    </FormModal>
  );
};

export const useRebalanceDialog = makeUseModal<Props>(RebalanceDialog, { size: 'lg' });

export default RebalanceDialog;
