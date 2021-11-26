import React, { ReactElement } from 'react';
import { Form, Formik, FormikHelpers } from 'formik';
import { Button } from 'react-bootstrap';
import * as responsive from 'react-responsive';
import Http from '@mortvola/http';
import { FormField, FormError, setFormErrors } from '@mortvola/forms';
import styles from './Signup.module.css';
import { isErrorResponse } from '../common/ResponseTypes';

const Signup = (): ReactElement => {
  const tiny = responsive.useMediaQuery({ query: '(max-width: 350px)' });
  const small = responsive.useMediaQuery({ query: '(max-width: 600px)' });
  const medium = responsive.useMediaQuery({ query: '(max-width: 1224px)' });

  type FormValues = {
    username: string,
    email: string,
    password: string,
    // eslint-disable-next-line camelcase
    password_confirmation: string,
  };

  const addSizeClass = (className: string): string => {
    if (tiny) {
      // eslint-disable-next-line css-modules/no-undef-class
      return `${styles.tiny} ${className}`;
    }

    if (small) {
      // eslint-disable-next-line css-modules/no-undef-class
      return `${styles.small} ${className}`;
    }

    if (medium) {
      // eslint-disable-next-line css-modules/no-undef-class
      return `${styles.medium} ${className}`
    }

    return className
  }

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const response = await Http.post('/register', values);

    if (response.ok) {
      window.location.replace('/home');
    }
    else {
      const body = await response.body();

      if (isErrorResponse(body)) {
        setFormErrors(setErrors, body.errors);
      }
    }
  }

  return (
    <div className={addSizeClass(styles.frame)}>
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
            autoComplete="new-password"
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
