import React from 'react';
import {
  Form, Formik, FormikHelpers, FormikState,
} from 'formik';
import Http from '@mortvola/http';
import {
  FormError, setFormErrors, FormField, SubmitButton,
} from '@mortvola/forms';
import styles from './Signin.module.css';
import { isErrorResponse } from '../../common/ResponseTypes';
import { Context } from './Types';

type PropsType = {
  context: Context,
  onCompletion: (context: Context) => void,
  link: React.ReactNode,
}

const EnterPassCode: React.FC<PropsType> = ({
  context,
  onCompletion,
  link,
}) => {
  type FormValues = {
    passCode: string,
  };

  type VerifyCodeRequest = {
    email: string,
    code: string,
  }

  type VerifyCodeResponse = {
    data: {
      access: string,
      refresh: string,
      username: string,
    }
  }

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const response = await Http.post<VerifyCodeRequest, VerifyCodeResponse>('/api/code-verify', {
      email: context.email,
      code: values.passCode,
    });

    if (response.ok) {
      const body = await response.body();

      Http.setTokens(body.data.access, body.data.refresh);

      onCompletion({ ...context, state: 'Change Password' })
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
        passCode: '',
      }}
      onSubmit={handleSubmit}
    >
      {
        ({ isSubmitting }: FormikState<FormValues>) => (
          <Form className={styles.form}>
            <div className={styles.subtitle}>
              We sent a code to the email address you provided. Enter the code below and click the Verify Code button.
            </div>
            <FormField name="passCode" label="Pass Code" autoComplete="one-time-code" />

            <SubmitButton
              className={styles.button}
              isSubmitting={isSubmitting}
              label="Verify Code"
              submitLabel="Verifying Code"
            />

            { link }
            <FormError name="general" />
          </Form>
        )
      }
    </Formik>
  );
}

export default EnterPassCode;
