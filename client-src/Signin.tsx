import React, { ReactElement } from 'react';
import { Form, Formik, FormikHelpers } from 'formik';
import { Button } from 'react-bootstrap';
import { httpPost } from './State/Transports';
import styles from './Signin.module.css';
import FormError from './Modal/FormError';
import FormField from './Modal/FormField';
import { isErrorResponse } from '../common/ResponseTypes';

const Signin = (): ReactElement => {
  type FormValues = {
    username: string,
    password: string,
  };

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const response = await httpPost('/login', values);

    if (response.ok) {
      window.location.replace('/home');
    }
    else {
      const body = await response.body();

      if (isErrorResponse(body)) {
        const errors: Record<string, string> = {};

        body.errors.forEach((error) => {
          errors[error.field] = error.message;
        });

        setErrors(errors);
      }
    }
  }

  return (
    <div className={styles.frame}>
      <div className={styles.title}>SpendCraft</div>
      <Formik<FormValues>
        initialValues={{
          username: '',
          password: '',
        }}
        onSubmit={handleSubmit}
      >
        <Form className={styles.form}>
          <div className={styles.subtitle}>Enter your username and password.</div>
          <FormField name="username" label="Username" />
          <FormField
            type="password"
            name="password"
            label="Password"
            autoComplete
          />

          <Button className={styles.button} type="submit" variant="primary">
            Signin
          </Button>

          <FormError name="general" />
        </Form>
      </Formik>
    </div>
  );
}

export default Signin;
