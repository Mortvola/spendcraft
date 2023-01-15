import React from 'react';
import {
  Form, Formik, FormikHelpers, FormikState,
} from 'formik';
import * as responsive from 'react-responsive';
import Http from '@mortvola/http';
import {
  FormError, setFormErrors, FormField, SubmitButton,
} from '@mortvola/forms';
import { useNavigate } from 'react-router-dom';
import styles from './Signin.module.css';
import { isErrorResponse } from '../common/ResponseTypes';

const RecoverPassword: React.FC = () => {
  const tiny = responsive.useMediaQuery({ query: '(max-width: 350px)' });
  const small = responsive.useMediaQuery({ query: '(max-width: 600px)' });
  const medium = responsive.useMediaQuery({ query: '(max-width: 1224px)' });
  const navigate = useNavigate();

  type FormValues = {
    email: string,
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
    const response = await Http.post('/api/password/email', values);

    if (response.ok) {
      navigate('/signin', { replace: true });
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
          email: '',
        }}
        onSubmit={handleSubmit}
      >
        {
          ({ isSubmitting }: FormikState<FormValues>) => (
            <Form className={styles.form}>
              <div className={styles.subtitle}>Enter the email address associated with your account.</div>
              <FormField name="email" label="E-Mail" autoComplete="email" />

              <SubmitButton
                className={styles.button}
                isSubmitting={isSubmitting}
                label="Reset Password"
                submitLabel="Resetting Password"
              />

              <a href="/signin">I remember my password.</a>
              <FormError name="general" />
            </Form>
          )
        }
      </Formik>
    </div>
  );
}

export default RecoverPassword;
