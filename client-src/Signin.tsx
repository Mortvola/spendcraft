import React, { ReactElement } from 'react';
import { Form, Formik, FormikHelpers } from 'formik';
import { Button } from 'react-bootstrap';
import * as responsive from 'react-responsive';
import Http from '@mortvola/http';
import styles from './Signin.module.css';
import FormError from './Modal/FormError';
import FormField from './Modal/FormField';
import { isErrorResponse } from '../common/ResponseTypes';
import { setFormErrors } from './Modal/Errors';

const Signin = (): ReactElement => {
  const tiny = responsive.useMediaQuery({ query: '(max-width: 350px)' });
  const small = responsive.useMediaQuery({ query: '(max-width: 600px)' });
  const medium = responsive.useMediaQuery({ query: '(max-width: 1224px)' });

  type FormValues = {
    username: string,
    password: string,
  };

  const addSizeClass = (className: string): string => {
    if (tiny && styles.tiny) {
      return `${styles.tiny} ${className}`;
    }

    if (small && styles.small) {
      return `${styles.small} ${className}`;
    }

    if (medium && styles.medium) {
      return `${styles.medium} ${className}`
    }

    return className
  }

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const response = await Http.post('/login', values);

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
          password: '',
        }}
        onSubmit={handleSubmit}
      >
        <Form className={styles.form}>
          <div className={styles.subtitle}>Enter your username and password.</div>
          <FormField name="username" label="Username" autoComplete="username" />
          <FormField
            type="password"
            name="password"
            label="Password"
            autoComplete="current-password"
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
