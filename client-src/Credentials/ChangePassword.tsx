import React from 'react';
import {
  Form, Formik, FormikHelpers, FormikState,
} from 'formik';
import Http from '@mortvola/http';
import {
  FormError, setFormErrors, FormField, SubmitButton,
} from '@mortvola/forms';
import { useNavigate } from 'react-router-dom';
import styles from './Signin.module.css';
import { isErrorResponse } from '../../common/ResponseTypes';
import { Context } from './Types';

type PropsType = {
  context: Context,
  onNext: (context: Context) => void,
  link: React.ReactNode,
}

const ChangePassword: React.FC<PropsType> = ({
  context,
  onNext,
  link,
}) => {
  const navigate = useNavigate();

  type FormValues = {
    password: string,
    passwordConfirmation: string,
  };

  type UpdatePasswordRequest = {
    password: string,
    passwordConfirmation: string,
  }

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const response = await Http.post<UpdatePasswordRequest, void>('/api/v1/password/update', {
      password: values.password,
      passwordConfirmation: values.passwordConfirmation,
    });

    if (response.ok) {
      onNext(context)
    }
    else {
      const body = await response.body();

      if (isErrorResponse(body)) {
        setFormErrors(setErrors, body.errors);
      }
    }
  }

  return (
    <Formik<FormValues>
      initialValues={{
        password: '',
        passwordConfirmation: '',
      }}
      onSubmit={handleSubmit}
    >
      {
        ({ isSubmitting }: FormikState<FormValues>) => (
          <Form className={styles.form}>
            <div className={styles.subtitle}>Enter your new password.</div>
            <FormField
              type="password"
              name="password"
              label="Password"
              autoComplete="new-password"
            />
            <FormField
              type="password"
              name="passwordConfirmation"
              label="Confirm Password"
              autoComplete="new-password"
            />

            <SubmitButton
              className={styles.button}
              isSubmitting={isSubmitting}
              label="Change Password"
              submitLabel="Changing Password"
            />

            { link }
            <FormError name="general" />
          </Form>
        )
      }
    </Formik>
  );
}

export default ChangePassword;
