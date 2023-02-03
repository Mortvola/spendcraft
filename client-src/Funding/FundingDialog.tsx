import React, {
  useState, useEffect, useCallback,
} from 'react';
import {
  Field, FieldProps,
  FormikErrors, FormikState, FormikContextType,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import Http from '@mortvola/http';
import { FormModal, FormError, setFormErrors } from '@mortvola/forms';
import Amount from '../Amount';
import { useStores } from '../State/mobxStore';
import Transaction from '../State/Transaction';
import {
  FundingPlanProps, isFundingPlansResponse, TransactionType,
  CategoryFundingProps,
  ProposedFundingCateggoryProps,
} from '../../common/ResponseTypes';
import Funding from './Funding';
import { FundingPlanType, FundingType } from './Types'
import styles from './Funding.module.css'

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

  const getTotal = useCallback((
    categories: FundingType[],
  ) => (
    categories.reduce((accumulator: number, item) => (
      fundingPoolCat && item.categoryId === fundingPoolCat.id
        ? accumulator
        : accumulator + item.amount
    ), 0)
  ), [fundingPoolCat]);

  type ValueType = {
    date: string,
    funding: FundingPlanType,
  }

  const getCategoryBalance = (categoryId: number) => {
    const category = categoryTree.getCategory(categoryId);

    if (!category) {
      throw new Error('category is null');
    }

    return category.balance;
  }

  const getPlanCategories = (categories: CategoryFundingProps[]) => (
    categories.map((c) => ({
      id: c.id,
      initialAmount: getCategoryBalance(c.categoryId) - c.amount,
      amount: c.amount,
      categoryId: c.categoryId,
      expectedToSpend: c.expectedToSpend,
      adjusted: c.adjusted,
      adjustedReason: c.adjustedReason,
      previousFunding: c.previousFunding,
      previousExpenses: c.previousExpenses,
    }))
  )

  const [plansInitialized, setPlansInitialized] = useState(false);
  const [plans, setPlans] = useState<FundingPlanProps[]>([]);
  const [selectedPlan, setSelectedPlan] = useState(-1);
  const [funding, setFunding] = useState<FundingPlanType>(
    transaction
      ? {
        planId: -1,
        categories: getPlanCategories(transaction.categories),
      }
      : { planId: -1, categories: [] },
  );
  const [total, setTotal] = useState<number>(
    transaction
      ? getTotal(funding.categories)
      : 0,
  );
  const [availableFunds, setAvailableFunds] = useState(fundingPoolCat.balance);

  useEffect(() => {
    const funded = getTotal(funding.categories);
    setAvailableFunds(fundingPoolCat.balance - funded);
    setTotal(funded);
  }, [fundingPoolCat, funding, getTotal]);

  if (!plansInitialized) {
    setPlansInitialized(true);

    (async () => {
      const response = await Http.get('/api/v1/funding-plans');

      const body = await response.body();

      if (isFundingPlansResponse(body)) {
        setPlans(body);
      }
    })()
  }

  const handlePlanChange = async (
    event: React.ChangeEvent<HTMLSelectElement>,
    resetForm: (nextState?: Partial<FormikState<ValueType>> | undefined) => void,
    values: ValueType,
  ) => {
    const { value } = event.target;
    const planId = parseInt(value, 10)
    setSelectedPlan(planId);
    const response = await Http.get<ProposedFundingCateggoryProps[]>(`/api/v1/funding-plans/${planId}/proposed`);

    if (response.ok) {
      const body = await response.body();

      const newPlan = {
        planId,
        categories: getPlanCategories(body),
      };
      setFunding(newPlan);
      resetForm({ values: { ...values, funding: newPlan } });
    }
  };

  const populatePlans = () => {
    const planOptions = [(<option key={-1} value={-1}>None</option>)];

    plans.forEach(({ id, name }) => {
      planOptions.push(<option key={id} value={id}>{name}</option>);
    });

    return planOptions;
  };

  const handleFundingChange = (newFunding: FundingPlanType) => {
    setFunding(newFunding);

    const sum = getTotal(newFunding.categories);

    setTotal(sum);
  };

  const handleSubmit = async (values: ValueType) => {
    type Request = {
      date: string,
      categories: CategoryFundingProps[],
    }

    const request: Request = {
      date: values.date,
      categories: values.funding.categories.filter((item) => (
        item.amount !== 0
      ))
        .map((item) => ({
          id: item.id,
          categoryId: item.categoryId,
          amount: item.amount,
        })),
    };

    const sum = getTotal(funding.categories);

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

    values.funding.categories.forEach((item) => {
      if (item.amount !== 0) {
        count += 1;
      }
    });

    if (count === 0 && errors.funding) {
      errors.funding.categories = 'At least one non-zero funding item must be entered.';
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

  return (
    <FormModal<ValueType>
      setShow={setShow}
      initialValues={{
        date: transaction ? transaction.date.toISODate() : '',
        funding,
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Fund Categories"
      formId="fundingDialogForm"
      onDelete={transaction ? handleDelete : null}
    >
      <div className="fund-container">
        <div className="funding-header">
          <label>
            Plan:
            <Field name="plans">
              {({
                form: {
                  resetForm,
                  values,
                },
              }: FieldProps<ValueType>) => (
                <select
                  className="form-control"
                  value={selectedPlan}
                  onChange={(event) => (
                    handlePlanChange(event, resetForm, values)
                  )}
                >
                  {populatePlans()}
                </select>
              )}
            </Field>
          </label>
          <label>
            Date:
            <Field className="form-control" type="date" name="date" />
          </label>
          <label>
            Available Funds:
            <Amount className="form-control" amount={availableFunds} />
          </label>
        </div>
        <FormError name="date" />
        <div className="cat-fund-table">
          <Field name="funding">
            {({
              field: {
                name,
                value,
              },
              form: {
                setFieldValue,
              },
            }: FieldProps<FundingPlanType>) => (
              <Funding
                key={value.planId}
                groups={categoryTree.nodes}
                plan={value.categories}
                systemGroupId={categoryTree.systemIds.systemGroupId || 0}
                onChange={(newFunding: FundingType[]) => {
                  const newPlan = {
                    planId: value.planId,
                    categories: newFunding,
                  };
                  handleFundingChange(newPlan);
                  setFieldValue(name, newPlan, false);
                }}
              />
            )}
          </Field>
          <FormError name="funding" />
        </div>
        <div className={`${styles.fundListItem} ${styles.catFundTitle}`}>
          <div className={styles.fundListCatName} />
          <div className={styles.labeledAmount}>
            Total
            <Amount style={{ minWidth: '6rem' }} amount={total} />
          </div>
          <div className={`dollar-amount ${styles.fundListAmt}`} />
        </div>
      </div>
    </FormModal>
  );
};

export const useFundingDialog = makeUseModal<PropsType>(FundingDialog);

export default FundingDialog;
