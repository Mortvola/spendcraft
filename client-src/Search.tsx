import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  Field, Form, Formik, FormikErrors,
} from 'formik';
import { useStores } from './State/Store';
import PostedRegister from './Transactions/PostedRegister';
import trxStyles from './Transactions/Transactions.module.scss';
import styles from './Search.module.scss';

const Search: React.FC = observer(() => {
  const { searcher, uiState } = useStores();

  interface Values {
    name: string,
    amount: string,
  }

  const handleSubmit = (values: Values) => {
    let queryString = '';

    if (values.name.trim() !== '') {
      queryString = `name=${values.name}`
    }

    if (values.amount.trim() !== '') {
      if (queryString !== '') {
        queryString += '&'
      }

      queryString += `amount=${values.amount}`
    }

    searcher.transactions.getData(0, queryString);

    uiState.search = { name: values.name, amount: values.amount }
  }

  const handleValidate = (values: Values): FormikErrors<Values> => {
    const errors: FormikErrors<Values> = {};

    if (values.name.trim() === '' && values.amount.trim() === '') {
      errors.name = 'A non-empty search string must be provided';
    }

    return errors;
  }

  return (
    <div className={styles.layout}>
      <Formik<Values>
        initialValues={{ name: uiState.search.name, amount: uiState.search.amount }}
        onSubmit={handleSubmit}
        validate={handleValidate}
      >
        <Form>
          <div className={styles.form}>
            <div className={styles.criteria}>
              <div className={styles.search}>
                Name:
                <Field name="name" />
              </div>
              <div className={styles.search}>
                Amount:
                <Field name="amount" />
              </div>
            </div>
            <button type="submit">
              Search
            </button>
          </div>
        </Form>
      </Formik>
      <div className={`${trxStyles.registerWrapper} ${trxStyles.search}`}>
        <PostedRegister
          type="account"
          trxContainer={searcher.transactions}
          category={null}
          account={null}
        />
      </div>
    </div>
  )
});

export default Search;
