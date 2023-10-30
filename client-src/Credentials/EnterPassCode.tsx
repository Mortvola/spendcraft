import React from 'react';
import {
  Form, Formik, FormikHelpers, FormikState,
} from 'formik';
import Http from '@mortvola/http';
import {
  FormError, setFormErrors, FormField, SubmitButton,
} from '@mortvola/forms';
import { Button } from 'react-bootstrap';
import styles from './Signin.module.scss';
import { isErrorResponse } from '../../common/ResponseTypes';
import { Context } from './Types';

type PropsType = {
  context: Context,
  onNext: (context: Context) => void,
  link?: React.ReactNode,
}

const EnterPassCode: React.FC<PropsType> = ({
  context,
  onNext,
  link,
}) => {
  const [resendStatus, setResendStatus] = React.useState<string>('')

  type FormValues = {
    code: string,
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
    const response = await Http.post<VerifyCodeRequest, VerifyCodeResponse>('/api/v1/code-verify', {
      email: context.email,
      code: values.code,
    });

    if (response.ok) {
      const body = await response.body();

      Http.setTokens(body.data.access, body.data.refresh);

      onNext(context)
    }
    else {
      const body = await response.body();

      if (isErrorResponse(body)) {
        setFormErrors(setErrors, body.errors);
      }
    }
  }

  const sendCode = async () => {
    setResendStatus('Sending new code.')
    const response = await Http.post('/api/v1/code-request', {
      email: context.email,
    });

    if (response.ok) {
      setResendStatus('A new code has been sent to the email address you provided.')
    }
    else {
      setResendStatus('An error occured. Please try again later.')
    }
  }

  return (
    <Formik<FormValues>
      initialValues={{
        code: '',
      }}
      onSubmit={handleSubmit}
    >
      {
        ({ isSubmitting }: FormikState<FormValues>) => (
          <Form className={styles.form}>
            <div className={styles.description}>
              A a one-time pass code has been sent to the email address you provided
              to verify you are the owner. Enter the one-time pass code below and
              click the Verify Code button.
            </div>
            <FormField name="code" label="Pass Code" autoComplete="one-time-code" />

            <SubmitButton
              className={styles.button}
              isSubmitting={isSubmitting}
              label="Verify Code"
              submitLabel="Verifying Code"
            />

            <div className={styles.description}>
              If you did not receive the code or if the code has expired,
              click the button below to send a new code to your email address.
            </div>
            <Button className={styles.button} onClick={sendCode}>Send New Code</Button>
            <div className={styles.status}>{resendStatus}</div>

            { link }
            <FormError name="general" />
          </Form>
        )
      }
    </Formik>
  );
}

export default EnterPassCode;
