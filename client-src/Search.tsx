import React from 'react';
import { observer } from 'mobx-react-lite';
import { Field, Form, Formik, FormikValues } from 'formik';
import { useStores } from './State/mobxStore';
import PostedRegister from './Transactions/PostedRegister';
import trxStyles from './Transactions/Transactions.module.scss';
import styles from './Search.module.scss';

const Search: React.FC = observer(() => {
  const { searcher } = useStores();

  type Values = {
    search: ''
  }

  const handleSubmit = (values: FormikValues) => {
    searcher.transactions.getTransactions(0, `name=${values.search}`);
  }

  return (
    <div className={styles.layout}>
      <Formik<Values>
        initialValues={{ search: '' }}
        onSubmit={handleSubmit}
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
