/* eslint-disable jsx-a11y/control-has-associated-label */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, {
  useState, useEffect, useContext, useCallback,
  ReactElement,
} from 'react';
import { Modal, Button, ModalBody } from 'react-bootstrap';
import {
  Formik, Form, Field, ErrorMessage, FieldProps,
  FormikErrors, FormikState,
} from 'formik';
import Funding from './Funding';
import Amount from '../Amount';
import MobxStore from '../state/mobxStore';
import useModal, { ModalProps } from '../useModal';
import Transaction from '../state/Transaction';
import { NewTransactionCategoryInterface, TransactionCategoryInterface } from '../state/State';
import { patchJSON, postJSON } from '../state/Transports';

interface Props {
  // eslint-disable-next-line react/require-default-props
  transaction?: Transaction;
}

const FundingDialog = ({
  transaction,
  onHide,
  show,
}: Props & ModalProps): ReactElement => {
  const { categoryTree } = useContext(MobxStore);

  const getTotal = useCallback((
    categories: Array<TransactionCategoryInterface | NewTransactionCategoryInterface>,
  ) => (
    categories.reduce((accumulator: number, item) => (
      item.categoryId === categoryTree.systemIds.fundingPoolId
        ? accumulator
        : accumulator + item.amount
    ), 0)
  ), [categoryTree.systemIds.fundingPoolId]);

  type FundingType = {
    planId: number;
    categories: Array<TransactionCategoryInterface>
  }

  type ValueType = {
    date: string,
    funding: FundingType,
  }

  const [plansInitialized, setPlansInitialized] = useState(false);
  const [groupsInitialized, setGroupsInitialized] = useState(false);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(-1);
  const [funding, setFunding] = useState(
    transaction
      ? { planId: -1, categories: transaction.categories }
      : { planId: -1, categories: [] },
  );
  const [total, setTotal] = useState(
    transaction
      ? getTotal(transaction.categories)
      : 0,
  );
  const [groups, setGroups] = useState([]);
  const [availableFunds, setAvailableFunds] = useState(categoryTree.getFundingPoolAmount());

  useEffect(() => {
    const funded = getTotal(funding.categories);
    setAvailableFunds(categoryTree.getFundingPoolAmount() - funded);
    setTotal(funded);
  }, [categoryTree, funding, getTotal]);

  if (!plansInitialized) {
    setPlansInitialized(true);

    fetch('/api/funding_plans')
      .then(
        async (response) => setPlans(await response.json()),
      );
  }

  const handlePlanChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
    resetForm: (nextState?: Partial<FormikState<any>> | undefined) => void,
    values: ValueType,
  ) => {
    const { value } = event.target;
    setSelectedPlan(parseInt(value, 10));
    fetch(`/api/funding_plan/${value}`)
      .then(
        async (response) => {
          const json = await response.json();
          const newPlan = { planId: json.id, categories: json.categories };
          setFunding(newPlan);
          resetForm({ values: { ...values, funding: newPlan } });
        },
      );
  };

  if (!groupsInitialized) {
    setGroupsInitialized(true);

    fetch('/api/groups')
      .then(
        (response) => response.json(),
      )
      .then(
        (json) => (setGroups(json)),
      );
  }

  const populatePlans = () => {
    const planOptions = [(<option key={-1} value={-1}>None</option>)];

    plans.forEach(({ id, name }) => {
      planOptions.push(<option key={id} value={id}>{name}</option>);
    });

    return planOptions;
  };

  const handleFundingChange = (newFunding: FundingType) => {
    setFunding(newFunding);

    const sum = getTotal(newFunding.categories);

    setTotal(sum);
  };

  const handleSubmit = async (values: ValueType) => {
    type Request = {
      date: string,
      type: number,
      categories: Array<TransactionCategoryInterface | NewTransactionCategoryInterface>,
    }

    const request: Request = {
      date: values.date,
      type: 2,
      categories: values.funding.categories.filter((item) => (
        item.amount !== 0
      ))
        .map((item) => ({
          id: item.id,
          categoryId: item.categoryId,
          amount: item.amount,
        })),
    };

    const sum = getTotal(request.categories);

    const index = request.categories.findIndex(
      (c) => c.categoryId === categoryTree.systemIds.fundingPoolId,
    );

    if (index === -1) {
      if (categoryTree.systemIds.fundingPoolId === null) {
        throw new Error('fundingPoolId is null');
      }

      request.categories.push({
        categoryId: categoryTree.systemIds.fundingPoolId,
        amount: -sum,
      });
    }
    else {
      request.categories[index].amount = -sum;
    }

    let response;
    if (transaction) {
      response = await patchJSON(`/api/category_transfer/${transaction.id}`, request);
    }
    else {
      response = await postJSON('/api/category_transfer', request);
    }

    if (response.ok) {
      onHide();
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

  const Header = () => (
    <Modal.Header closeButton>
      <h4 id="modalTitle" className="modal-title">Fund Categories</h4>
    </Modal.Header>
  );

  const Footer = () => (
    <Modal.Footer>
      <div />
      <div />
      <Button variant="secondary" onClick={onHide}>Cancel</Button>
      <Button variant="primary" type="submit">Save</Button>
    </Modal.Footer>
  );

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="lg"
      scrollable
    >
      <Formik<ValueType>
        initialValues={{
          date: transaction ? transaction.date : '',
          funding,
        }}
        validate={handleValidate}
        onSubmit={handleSubmit}
      >
        <Form id="fundingDialogForm" className="scrollable-form">
          <Header />
          <ModalBody>
            <div className="funding-header">
              <label>
                Plan
                <Field name="plans">
                  {({
                    form: {
                      resetForm,
                      values,
                    },
                  }: FieldProps<ValueType>) => (
                    <select
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
                Date
                <Field type="date" name="date" />
              </label>
              <label>
                Available Funds
                <Amount amount={availableFunds} />
              </label>
            </div>
            <ErrorMessage name="date" />
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
                }: FieldProps<FundingType>) => (
                  <Funding
                    key={value.planId}
                    groups={groups}
                    plan={value.categories}
                    systemGroupId={categoryTree.systemIds.systemGroupId || 0}
                    onChange={(newFunding) => {
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
              <ErrorMessage name="funding" />
            </div>
            <div className="fund-list-item cat-fund-title">
              <div className="fund-list-cat-name" />
              <div className="dollar-amount fund-list-amt">Total</div>
              <div className="dollar-amount"><Amount amount={total} /></div>
              <div className="dollar-amount fund-list-amt" />
            </div>
          </ModalBody>
          <Footer />
        </Form>
      </Formik>
    </Modal>
  );
};

// FundingDialog.propTypes = {
//   onHide: PropTypes.func.isRequired,
//   show: PropTypes.bool.isRequired,
//   transaction: PropTypes.shape(),
// };

// FundingDialog.defaultProps = {
//   transaction: null,
// };

export const useFundingDialog = (): [
  (props: Props) => (ReactElement | null),
  () => void,
] => useModal<Props>(FundingDialog);

export default FundingDialog;
