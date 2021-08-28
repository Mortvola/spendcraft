import React, {
  useState, useEffect, useContext, useCallback,
  ReactElement,
} from 'react';
import {
  Field, FieldProps,
  FormikErrors, FormikState, FormikContextType,
} from 'formik';
import Amount from '../Amount';
import MobxStore from '../state/mobxStore';
import useModal, { ModalProps, useModalType } from '../Modal/useModal';
import Transaction from '../state/Transaction';
import { NewTransactionCategoryInterface, TransactionCategoryInterface } from '../state/State';
import {
  FundingPlanProps, isFundingPlanResponse, isFundingPlansResponse, TransactionType,
  FundingType,
} from '../../common/ResponseTypes';
import FormModal from '../Modal/FormModal';
import FormError from '../Modal/FormError';
import Funding from './Funding';
import { getBody, httpGet } from '../state/Transports';

interface Props {
  transaction?: Transaction;
  onHide?: () => void,
}

const FundingDialog = ({
  transaction,
  onHide,
  show,
  setShow,
}: Props & ModalProps): ReactElement => {
  const { categoryTree, register } = useContext(MobxStore);
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

  type FundingPlanType = {
    planId: number;
    categories: FundingType[]
  }

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

  const [plansInitialized, setPlansInitialized] = useState(false);
  const [plans, setPlans] = useState<FundingPlanProps[]>([]);
  const [selectedPlan, setSelectedPlan] = useState(-1);
  const [funding, setFunding] = useState<FundingPlanType>(
    transaction
      ? {
        planId: -1,
        categories: transaction.categories.map((c) => ({
          id: c.id,
          type: c.type,
          initialAmount: getCategoryBalance(c.categoryId) - c.amount,
          amount: c.amount,
          categoryId: c.categoryId,
        })),
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
      const response = await httpGet('/api/funding-plans');

      const body = await getBody(response);

      if (isFundingPlansResponse(body)) {
        setPlans(body);
      }
    })()
  }

  const handlePlanChange = async (
    event: React.ChangeEvent<HTMLSelectElement>,
    resetForm: (nextState?: Partial<FormikState<any>> | undefined) => void,
    values: ValueType,
  ) => {
    const { value } = event.target;
    setSelectedPlan(parseInt(value, 10));
    const response = await httpGet(`/api/funding-plans/${value}`);

    const body = await getBody(response);

    if (isFundingPlanResponse(body)) {
      const newPlan = { planId: body.id, categories: body.categories };
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
      categories: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    }

    const request: Request = {
      date: values.date,
      categories: values.funding.categories.filter((item) => (
        item.amount !== 0
      ))
        .map((item) => ({
          id: item.id,
          type: item.type,
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
        type: 'REGULAR',
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

      if (errors && errors.length > 0) {
        setTouched({ [errors[0].field]: true }, false);
        setErrors({ [errors[0].field]: errors[0].message });
      }
    }
  }

  return (
    <FormModal<ValueType>
      show={show}
      setShow={setShow}
      onHide={onHide}
      initialValues={{
        date: transaction ? transaction.date : '',
        funding,
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Fund Categories"
      formId="fundingDialogForm"
      size="lg"
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
          <div className="fund-list-item cat-fund-title">
            <div className="fund-list-cat-name">Category</div>
            <div className="dollar-amount fund-list-amt">Current</div>
            <div className="dollar-amount">Funding</div>
            <div className="dollar-amount fund-list-amt">Balance</div>
          </div>
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
                groups={categoryTree.groups}
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
        <div className="fund-list-item cat-fund-title">
          <div className="fund-list-cat-name" />
          <div className="dollar-amount fund-list-amt">Total</div>
          <div className="dollar-amount"><Amount amount={total} /></div>
          <div className="dollar-amount fund-list-amt" />
        </div>
      </div>
    </FormModal>
  );
};

export const useFundingDialog = (): useModalType<Props> => useModal<Props>(FundingDialog);

export default FundingDialog;
