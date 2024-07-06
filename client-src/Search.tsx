import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  Field, Form, Formik, FormikErrors, FormikValues,
} from 'formik';
import { useStores } from './State/Store';
import PostedRegister from './Transactions/PostedRegister';
import trxStyles from './Transactions/Transactions.module.scss';
import styles from './Search.module.scss';

const Search: React.FC = observer(() => {
  const { searcher } = useStores();

  type Values = {
    search: ''
  }

  const handleSubmit = (values: FormikValues) => {
    searcher.transactions.getData(0, `name=${values.search}`);
  }

  const handleValidate = (values: FormikValues): FormikErrors<Values> => {
    const errors: FormikErrors<Values> = {};

    if (values.search.trim() === '') {
      errors.search = 'A non-empty search string must be provided';
    }

    return errors;
  }

  return (
    <div className={styles.layout}>
      <Formik<Values>
        initialValues={{ search: '' }}
        onSubmit={handleSubmit}
        validate={handleValidate}
      >
        <Form>
          <div className={styles.form}>
            <Field name="search" />
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
