import React, {
  useEffect, useState,
} from 'react';
import {
  Form, Formik, FormikHelpers, FormikProps,
} from 'formik';
import { Observer } from 'mobx-react-lite';
import {
  FormControl, InputGroup, Button,
} from 'react-bootstrap';
import { FormField, setFormErrors } from '@mortvola/forms';
import { useStores } from './State/mobxStore';
import IconButton from './IconButton';

type FormValues = {
  username: string,
  email: string,
};

const MyInputGroup: React.FC<FormikProps<FormValues>> = (props: FormikProps<FormValues>) => {
  const { user } = useStores();

  return (
    <InputGroup>
      <FormControl {...props} readOnly={user.pendingEmail !== null} />
      <Button type="submit">Change</Button>
    </InputGroup>
  );
}

const UserAccount: React.FC = () => {
  const { user } = useStores();
  const [initialized, setInitialized] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      await user.load();
      setInitialized(true);
    })();
  }, [user]);

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const errors = await user.update(values.email);

    if (errors) {
      setFormErrors(setErrors, errors);
    }
  }

  const handleDeletePending = async () => {
    await user.deletePendingEmail();
  }

  const handleResendClick = () => {
    user.resendVerificationLink();
  }

  if (initialized) {
    return (
      <Observer>
        {
          () => (
            <Formik<FormValues>
              initialValues={{
                username: user.username ?? '',
                email: user.email ?? '',
              }}
              onSubmit={handleSubmit}
            >
              <Form
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  maxWidth: '20rem',
                  margin: '1rem',
                }}
              >
                <FormField name="username" readOnly label="Username:" />
                <div style={{ display: 'flex', alignItems: 'end' }}>
                  <FormField name="email" label="Email:" as={MyInputGroup} />
                </div>
                {
                  user.pendingEmail
                    ? (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          marginTop: '0.5rem',
                          maxWidth: 'max-content',
                          overflow: 'hidden',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div>Pending verification:</div>
                          <div style={{ display: 'flex', whiteSpace: 'nowrap' }}>
                            <div className="ellipsis" style={{ margin: '0 0.5rem' }}>{user.pendingEmail}</div>
                            <IconButton
                              icon="trash"
                              iconColor="red"
                              onClick={handleDeletePending}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'blue',
                            fontSize: 'small',
                            width: 'max-content',
                          }}
                          onClick={handleResendClick}
                        >
                          Resend verification link
                        </button>
                      </div>
                    )
                    : null
                }
              </Form>
            </Formik>
          )
        }
      </Observer>
    )
  }

  return null;
}

export default UserAccount;
