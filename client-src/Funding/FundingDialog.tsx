import React, {
  useState,
} from 'react';
import {
  Field, FieldProps,
  FormikErrors, FormikContextType,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import Http from '@mortvola/http';
import { FormModal, FormError, setFormErrors } from '@mortvola/forms';
import { DateTime } from 'luxon';
import Amount from '../Amount';
import { useStores } from '../State/mobxStore';
import Transaction from '../State/Transaction';
import {
  FundingPlanProps, isFundingPlansResponse, TransactionType,
  CategoryFundingProps,
} from '../../common/ResponseTypes';
import Funding from './Funding';
import {
  CategoriesValueType,
  FundingType, ValueType,
} from './Types'
import styles from './Funding.module.scss'

type PropsType = {
  transaction?: Transaction;
}

const FundingDialog: React.FC<PropsType & ModalProps> = ({
  transaction,
  setShow,
}) => {
  const { categoryTree, register } = useStores();
  const { fundingPoolCat } = categoryTree;

  if (!fundingPoolCat) {
    throw new Error('funding pool is unassigned');
  }

  const [plansInitialized, setPlansInitialized] = useState(false);
  const [plans, setPlans] = useState<FundingPlanProps[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState(-1);

  if (!plansInitialized) {
    setPlansInitialized(true);

    if (!transaction) {
      (async () => {
        const response = await Http.get('/api/v1/funding-plans');

        const body = await response.body();

        if (isFundingPlansResponse(body)) {
          setPlans(body);
        }
      })();
    }
  }

  // If there is only one plan then automatically select it.
  React.useEffect(() => {
    if (plans.length === 1) {
      setSelectedPlanId(plans[0].id)
    }
  }, [plans]);

  const handlePlanChange = async (
    event: React.ChangeEvent<HTMLSelectElement>,
    // resetForm: (nextState?: Partial<FormikState<ValueType>> | undefined) => void,
    // values: ValueType,
  ) => {
    const { value } = event.target;
    const planId = parseInt(value, 10)
    setSelectedPlanId(planId);
  };

  const renderPlans = () => {
    const planOptions = [(<option key={-1} value={-1}>None</option>)];

    plans.forEach(({ id, name }) => {
      planOptions.push(<option key={id} value={id}>{name}</option>);
    });

    return planOptions;
  };

  const getCategoriesSum = (categories: CategoriesValueType) => {
    const v = Object.keys(categories).reduce((sum, k) => {
      const value = categories[k];
      const newValue = typeof value === 'string' ? parseFloat(value) : value;
      return sum + newValue;
    }, 0)

    return v;
  }

  const getTransactionCategoryId = (categoryId: number) => {
    if (transaction) {
      const ct = transaction.categories.find((c) => c.categoryId === categoryId);

      if (ct !== undefined) {
        return ct.id
      }
    }

    return undefined;
  }

  const handleSubmit = async (values: ValueType) => {
    type Request = {
      date: string,
      categories: CategoryFundingProps[],
    }

    const categories = Object.keys(values.categories).map((k) => {
      const value = values.categories[k];
      const amount = typeof value === 'string' ? parseFloat(value) : value;
      const categoryId = parseInt(k, 10);
      return {
        id: getTransactionCategoryId(categoryId),
        categoryId,
        amount,
      }
    })
      .filter((c) => c.amount !== 0);

    const request: Request = {
      date: values.date,
      categories,
    };

    const sum = getCategoriesSum(values.categories);

    // Check for an existing funding pool category in the list of categories.
    // One should be found if this is a transaction we are editing. Otherwise, 
    // it should not be found.
    const index = request.categories.findIndex(
      (c) => fundingPoolCat && c.categoryId === fundingPoolCat.id,
    );

    if (index === -1) {
      if (!fundingPoolCat || fundingPoolCat.id === null) {
        throw new Error('fundingPoolId is null');
      }

      request.categories.push({
        categoryId: fundingPoolCat.id,
        amount: -sum,
      });
    }
    else {
      request.categories[index].amount = -sum;
    }

    let errors: Error[] | null;
    if (transaction) {
      errors = await transaction.updateCategoryTransfer(request);
    }
    else {
      errors = await register.addCategoryTransfer(request, TransactionType.FUNDING_TRANSACTION);
    }

    if (!errors) {
      setShow(false);
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.date === '') {
      errors.date = 'A date must be specified.';
    }

    // Verify that there is at least one non-zero funding item.
    let count = 0;

    Object.keys(values.categories).forEach((k) => {
      const value = values.categories[k];
      const newValue = typeof value === 'string' ? parseFloat(value) : value;

      if (newValue !== 0) {
        count += 1;
      }
    });

    if (count === 0) { //  && errors.funding) {
      console.log('At least one non-zero funding item must be entered.');
    }

    return errors;
  };

  const handleDelete = async (context: FormikContextType<ValueType>) => {
    const { setTouched, setErrors } = context;

    if (transaction) {
      const errors = await transaction.delete();

      if (errors) {
        setTouched({ [errors[0].field]: true }, false);
        setFormErrors(setErrors, errors);
      }
    }
  }

  const initialFundingDate = () => (
    (transaction
      ? transaction.date
      : DateTime.now().startOf('month')
    ).toISODate()
  );

  const initialFunding = (): CategoriesValueType => {
    if (transaction) {
      const obj: CategoriesValueType = {}

      transaction.categories.forEach((c) => {
        if (c.categoryId !== categoryTree.fundingPoolCat?.id) {
          obj[c.categoryId] = c.amount
        }
      })

      return obj;
    }

    return {};
  }

  return (
    <FormModal<ValueType>
      setShow={setShow}
      initialValues={{
        date: initialFundingDate() ?? '',
        categories: initialFunding(),
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Fund Categories"
      formId="fundingDialogForm"
      onDelete={transaction ? handleDelete : null}
    >
      <div className="fund-container">
        <div className="funding-header">
          {
            !transaction && plans.length > 1
              ? (
                <label>
                  Plan:
                  <Field name="plans">
                    <select
                      className="form-control"
                      value={selectedPlanId}
                      onChange={(event) => (
                        handlePlanChange(event)
                      )}
                    >
                      {renderPlans()}
                    </select>
                  </Field>
                </label>
              )
              : null
          }
          <label>
            Date:
            <Field name="date" type="date" className="form-control" />
          </label>
          <label>
            Available Funds:
            <Field>
              {
                ({ form: { values } }: FieldProps<FundingType[]>) => (
                  <Amount
                    className="form-control"
                    amount={fundingPoolCat.balance - getCategoriesSum(values.categories)}
                  />
                )
              }
            </Field>
          </label>
        </div>
        <FormError name="date" />
        <div className="cat-fund-table">
          <Field>
            {({
              form: {
                values,
              },
            }: FieldProps<FundingType[]>) => (
              <Funding
                planId={selectedPlanId}
                date={DateTime.fromISO(values.date)}
                // onChange={handleFundingChange}
              />
            )}
          </Field>
          <FormError name="funding" />
        </div>
        <div className={`${styles.fundListItem} ${styles.catFundTitle}`}>
          <div className={styles.fundListCatName} />
          <div className={styles.labeledAmount}>
            Total
            <Field>
              {
                ({ form: { values } }: FieldProps<FundingType[]>) => (
                  <Amount
                    style={{ minWidth: '6rem' }}
                    amount={getCategoriesSum(values.categories)}
                  />
                )
              }
            </Field>
          </div>
          <div className={`dollar-amount ${styles.fundListAmt}`} />
        </div>
      </div>
    </FormModal>
  );
};

export const useFundingDialog = makeUseModal<PropsType>(FundingDialog);

export default FundingDialog;
