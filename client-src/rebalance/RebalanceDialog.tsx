/* eslint-disable jsx-a11y/label-has-associated-control */
import React, {
  useState, useEffect, useCallback, ReactElement, useContext,
} from 'react';
import { Modal, Button, ModalBody } from 'react-bootstrap';
import {
  Formik, Form, Field, ErrorMessage, FormikErrors,
  FieldProps,
  useFormikContext,
  FormikContextType,
} from 'formik';
import { toJS } from 'mobx';
import CategoryRebalance from './CategoryRebalance';
import Amount from '../Amount';
import useModal, { ModalProps } from '../Modal/useModal';
import Transaction from '../state/Transaction';
import { TransactionCategoryInterface } from '../state/State';
import MobxStore from '../state/mobxStore';

interface Props {
  // eslint-disable-next-line react/require-default-props
  transaction?: Transaction,
}

const RebalanceDialog = ({
  transaction,
  show,
  onHide,
}: Props & ModalProps): ReactElement => {
  const { register } = useContext(MobxStore);
  const [categoryTree, setCategoryTree] = useState(null);
  const [unassigned, setUnassigned] = useState(0);
  const [date, setDate] = useState(transaction ? transaction.date : '');

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

      const url = new URL('/api/category_balances', window.location.href);
      url.search = (new URLSearchParams(params)).toString();

      fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then(
          (response) => response.json(),
          (error) => console.log('fetch error: ', error),
        )
        .then(
          (json) => {
            setCategoryTree(json);
          },
        );
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
        onHide();
      }
    }
    else {
      const errors = await register.addCategoryTransfer(values);

      if (!errors) {
        onHide();
      }
    }
  };

  const Header = () => (
    <Modal.Header closeButton>
      <h4 id="modalTitle" className="modal-title">Rebalance Categories</h4>
    </Modal.Header>
  );

  const handleDelete = async (bag: FormikContextType<unknown>) => {
    const { setTouched, setErrors } = bag;

    if (transaction) {
      const errors = await transaction.delete();

      if (errors && errors.length > 0) {
        setTouched({ name: true }, false);
        setErrors({ name: errors[0].message });
      }
    }
  };

  const DeleteButton = () => {
    const bag = useFormikContext();

    if (transaction) {
      return (<Button variant="danger" onClick={() => handleDelete(bag)}>Delete</Button>);
    }

    return <div />;
  };

  const Footer = () => (
    <Modal.Footer>
      <DeleteButton />
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
          categories: transaction ? toJS(transaction.categories) : [],
          date,
        }}
        validate={handleValidate}
        onSubmit={handleSubmit}
      >
        <Form id="rebalanceForm" className="scrollable-form">
          <Header />
          <ModalBody>
            <div className="rebalance-container">
              <div className="rebalance-header">
                <label>
                  Date
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
                        value={value}
                        type="date"
                        onChange={(event) => {
                          handleDateChange(event);
                          setFieldValue(name, event.target.value, false);
                        }}
                      />
                    )}
                  </Field>
                </label>
                <label>
                  Unassigned
                  <Amount className="rebalance-unassigned" amount={unassigned} />
                </label>
              </div>
              <ErrorMessage name="date" />
              <Field name="categories">
                {({
                  field: {
                    name,
                    value,
                  },
                  form: {
                    setFieldValue,
                  },
                }: FieldProps<Array<TransactionCategoryInterface>>) => (
                  <CategoryRebalance
                    categoryTree={categoryTree}
                    categories={value}
                    onDeltaChange={(_amount, delta, categories) => {
                      handleDeltaChange(delta);
                      setFieldValue(name, categories, false);
                    }}
                  />
                )}
              </Field>
              <ErrorMessage name="categories" />
            </div>
          </ModalBody>
          <Footer />
        </Form>
      </Formik>
    </Modal>
  );
};

export const useRebalanceDialog = (): [
  (props: Props) => (ReactElement | null),
  () => void,
] => useModal<Props>(RebalanceDialog);

export default RebalanceDialog;
