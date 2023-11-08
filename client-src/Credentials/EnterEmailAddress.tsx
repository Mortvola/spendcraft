import React from 'react';
import {
  Form, Formik, FormikHelpers, FormikState,
} from 'formik';
import Http from '@mortvola/http';
import {
  FormError, setFormErrors, FormField, SubmitButton,
} from '@mortvola/forms';
import styles from './Signin.module.scss';
import { isErrorResponse } from '../../common/ResponseTypes';
import { Context } from './Types';

type PropsType = {
  context: Context,
  onNext: (context: Context) => void,
  link: React.ReactNode,
}

const EnterEmailAddress: React.FC<PropsType> = ({
  context,
  onNext,
  link,
}) => {
  type FormValues = {
    email: string,
  };

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const response = await Http.post('/api/v1/code-request', values);

    if (response.ok) {
      onNext({ ...context, email: values.email })
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
              label="Continue"
              submitLabel="Continuing"
            />

            { link }
            <FormError name="general" />
          </Form>
        )
      }
    </Formik>
  );
}

export default EnterEmailAddress;
