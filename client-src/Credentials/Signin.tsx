import React from 'react';
import {
  Form, Formik, FormikHelpers, FormikState,
} from 'formik';
import * as responsive from 'react-responsive';
import Http from '@mortvola/http';
import {
  FormError, setFormErrors, FormField, SubmitButton,
} from '@mortvola/forms';
import { useNavigate, useLocation } from 'react-router';
import styles from './Signin.module.scss';
import { isErrorResponse } from '../../common/ResponseTypes';
import { runInAction } from 'mobx';
import { useStores } from '../State/Store';

const Signin: React.FC = () => {
  const { user, categoryTree, accounts } = useStores()
  const tiny = responsive.useMediaQuery({ query: '(max-width: 350px)' });
  const small = responsive.useMediaQuery({ query: '(max-width: 600px)' });
  const medium = responsive.useMediaQuery({ query: '(max-width: 1224px)' });
  const navigate = useNavigate();
  const location = useLocation();

  interface FormValues {
    username: string,
    password: string,
  }

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
    interface LoginResponse {
      data: {
        access: string,
        refresh: string,
      },
    }

    const response = await Http.post<FormValues, LoginResponse>('/api/v1/login', values);

    if (response.ok) {
      const { data } = await response.body()

      Http.setTokens(data.access, data.refresh);

      runInAction(() => {
        user.authenticated = true;
        user.load()
        categoryTree.load()
        accounts.load()
      })

      if (location.pathname === '/signin') {
        navigate('/home');
      }
    }
    else {
      const body = await response.body();

      if (isErrorResponse(body)) {
        setFormErrors(setErrors, body.errors);
      }
    }
  }

  const handleTitleClick = () => {
    navigate('/');
  }

  return (
    <div className={addSizeClass(styles.frame)}>
      <div className={styles.title} onClick={handleTitleClick}>SpendCraft</div>
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
              <div className={styles.subtitle}>Sign In</div>
              <div className={styles.description}>Enter your username and password.</div>
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

              <a href="/recover-password">Forgot Your Password?</a>
              <FormError name="general" />
            </Form>
          )
        }
      </Formik>
    </div>
  );
}

export default Signin;
