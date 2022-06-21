import React from 'react';
import { Form, Formik, FormikHelpers, FormikState } from 'formik';
import * as responsive from 'react-responsive';
import Http from '@mortvola/http';
import {
  FormError, setFormErrors, FormField, SubmitButton,
} from '@mortvola/forms';
import styles from './Signin.module.css';
import { isErrorResponse } from '../common/ResponseTypes';

const Signin: React.FC = () => {
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
        {
          ({ isSubmitting }: FormikState<FormValues>) => (
            <Form className={styles.form}>
              <div className={styles.subtitle}>Enter your username and password.</div>
              <FormField name="username" label="Username" autoComplete="username" />
              <FormField
                type="password"
                name="password"
                label="Password"
                autoComplete="current-password"
              />

              <SubmitButton
                className={styles.button}
                isSubmitting={isSubmitting}
                label="Sign In"
                submitLabel="Signing In"
              />

              <FormError name="general" />
            </Form>
          )
        }
      </Formik>
    </div>
  );
}

export default Signin;
