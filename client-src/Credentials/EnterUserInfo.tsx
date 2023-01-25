import React from 'react';
import {
  Form, Formik, FormikHelpers, FormikState,
} from 'formik';
import Http from '@mortvola/http';
import {
  FormField, FormError, setFormErrors, SubmitButton,
} from '@mortvola/forms';
import styles from './Signup.module.css';
import { isErrorResponse } from '../../common/ResponseTypes';
import { Context } from './Types';

type PropsType = {
  context: Context,
  onNext: (context: Context) => void,
}

const EnterUserInfo: React.FC<PropsType> = ({
  context,
  onNext,
}) => {
  type FormValues = {
    username: string,
    email: string,
    password: string,
    // eslint-disable-next-line camelcase
    passwordConfirmation: string,
  };

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const response = await Http.post('/api/v1/register', values);

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
        username: '',
        email: '',
        password: '',
        passwordConfirmation: '',
      }}
      onSubmit={handleSubmit}
    >
      {
        ({ isSubmitting }: FormikState<FormValues>) => (
          <Form className={styles.form}>
            <div className={styles.subtitle}>Sign Up</div>
            <div className={styles.description}>{'Let\'s get your account set up!'}</div>
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
              name="passwordConfirmation"
              label="Confirm Password"
              autoComplete="new-password"
            />

            <SubmitButton
              className={styles.button}
              isSubmitting={isSubmitting}
              label="Create my account"
              submitLabel="Creating your acccount"
            />

            <FormError name="general" />
            <div className={styles.finePrint}>
              {
                'By selecting "Create my account", you agree to our Terms'
                  + ' and have read and acknowledge our Privacy Statement.'
              }
            </div>
          </Form>
        )
      }
    </Formik>
  );
}

export default EnterUserInfo;
