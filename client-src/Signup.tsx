import React, { ReactElement } from 'react';
import { Form, Formik, FormikHelpers } from 'formik';
import { Button } from 'react-bootstrap';
import FormField from './Modal/FormField';
import styles from './Signup.module.css';
import FormError from './Modal/FormError';
import { httpPost } from './State/Transports';
import { isErrorResponse } from '../common/ResponseTypes';

const Signup = (): ReactElement => {
  type FormValues = {
    username: string,
    email: string,
    password: string,
    // eslint-disable-next-line camelcase
    password_confirmation: string,
  };

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const response = await httpPost('/register', values);

    if (response.ok) {
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
          email: '',
          password: '',
          password_confirmation: '',
        }}
        onSubmit={handleSubmit}
      >
        <Form className={styles.form}>
          <div className={styles.subtitle}>{'Let\'s get your account set up!'}</div>
          <FormField name="username" label="Username" />
          <FormField name="email" label="E-Mail Address" />
          <FormField
            type="password"
            name="password"
            label="Password"
            autoComplete
          />
          <FormField
            type="password"
            name="password_confirmation"
            label="Confirm Password"
            autoComplete="new-password"
          />

          <Button className={styles.button} type="submit" variant="primary">
            Create my account
          </Button>

          <FormError name="general" />
          <div className={styles.finePrint}>
            {
              'By selecting "Create my account", you agree to our Terms'
              + ' and have read and acknowledge our Privacy Statement.'
            }
          </div>
        </Form>
      </Formik>
    </div>
  );
}

export default Signup;
