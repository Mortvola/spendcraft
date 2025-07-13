import React, {
  useEffect, useState,
} from 'react';
import {
  Form, Formik, FormikHelpers, FormikProps, useFormikContext,
} from 'formik';
import { Observer } from 'mobx-react-lite';
import {
  Button,
  FormControl, InputGroup,
} from 'react-bootstrap';
import { FormField, setFormErrors, SubmitButton } from '@mortvola/forms';
import Http from '@mortvola/http';
import { useNavigate } from 'react-router';
import { Trash2 } from 'lucide-react';
import { useStores } from './State/Store';
import styles from './UserAccount.module.scss'
import { useDeleteConfirmation } from './DeleteConfirmation';
import PushRegistrationButton from './PushRegistrationButton';
import LucideButton from './LucideButton';

interface FormValues {
  username: string,
  email: string,
}

const MyInputGroup: React.FC<FormikProps<FormValues>> = (props: FormikProps<FormValues>) => {
  const { user } = useStores();
  const { isSubmitting } = useFormikContext();

  return (
    <InputGroup>
      <FormControl {...props} readOnly={user.pendingEmail !== null} />
      <SubmitButton
        isSubmitting={isSubmitting}
        label="Change"
        submitLabel="Changing"
      />
    </InputGroup>
  );
}

const UserAccount: React.FC = () => {
  const stores = useStores();
  const [initialized, setInitialized] = useState<boolean>(false);
  const navigate = useNavigate();

  const [DeleteConfirmation, handleDeleteClick] = useDeleteConfirmation(
    'Delete Confirmation',
    'Delete',
    (
      <>
        <div>
          Are you sure you want to delete your account?
        </div>
        <div style={{ marginTop: '1rem' }}>
          This is an irreverisible action.
        </div>
      </>
    ),
    async () => {
      const response = await Http.delete('/api/v1/user');

      if (response.ok) {
        stores.refresh();
        navigate('/');
      }
    },
  );

  useEffect(() => {
    (async () => {
      await stores.user.load();
      setInitialized(true);
    })();
  }, [stores.user]);

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const errors = await stores.user.update(values.email);

    if (errors) {
      setFormErrors(setErrors, errors);
    }
  }

  const handleDeletePending = async () => {
    await stores.user.deletePendingEmail();
  }

  const handleResendClick = () => {
    stores.user.resendVerificationLink();
  }

  if (initialized) {
    return (
      <>
        <Observer>
          {
            () => (
              <Formik<FormValues>
                initialValues={{
                  username: stores.user.username ?? '',
                  email: stores.user.email ?? '',
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
                    stores.user.pendingEmail
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
                              <div className="ellipsis" style={{ margin: '0 0.5rem' }}>{stores.user.pendingEmail}</div>
                              <LucideButton
                                onClick={handleDeletePending}
                              >
                                <Trash2 size={16} strokeWidth={2.5} />
                              </LucideButton>
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
                  <PushRegistrationButton
                    url="/api/v1/user/register-push/web"
                    className={styles.enableNotifications}
                  />
                  <Button variant="danger" className={styles.delete} onClick={handleDeleteClick}>
                    Delete Account
                  </Button>
                </Form>
              </Formik>
            )
          }
        </Observer>
        <DeleteConfirmation />
      </>
    )
  }

  return null;
}

export default UserAccount;
