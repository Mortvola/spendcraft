/* eslint-disable jsx-a11y/label-has-associated-control */
import React from 'react';
import { Observer, observer } from 'mobx-react-lite';
import {
  Field, ErrorMessage, FormikErrors,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { FormModal, FormField } from '@mortvola/forms';
import { PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { DateTime } from 'luxon';
import AccountItem from './AccountItem';
import { AccountTrackingProps, TrackingType } from '../../common/ResponseTypes';
import { useStores } from '../State/mobxStore';
import { InstitutionInterface } from '../State/State';

type PropsType = {
  publicToken: string,
  metadata: PlaidLinkOnSuccessMetadata,
  institution?: InstitutionInterface,
}

const AccountsDialog: React.FC<PropsType & ModalProps> = ({
  publicToken,
  metadata,
  institution,
  setShow,
}) => {
  const { accounts } = useStores();

  type ValuesType = {
    tracking: TrackingType[],
    startDate: string,
  };

  const handleValidate = (values: ValuesType) => {
    const errors: FormikErrors<ValuesType> = {};
    if (!values.tracking.some((s) => s !== 'None')) {
      errors.tracking = 'No tracking options selected';
    }

    if (values.startDate === '') {
      errors.startDate = 'Start is required';
    }

    return errors;
  };

  const handleSubmit = async (values: ValuesType) => {
    // if (!institution.unlinkedAccounts) {
    //   throw new Error('unlinkedAccounts is undefined');
    // }

    const accountTracking: AccountTrackingProps[] = metadata.accounts
      .map((a, i) => {
        if (values.tracking === null) {
          throw new Error('account selections is null');
        }

        if (values.tracking[i]) {
          return ({ id: a.id, mask: a.mask, tracking: values.tracking[i] })
        }

        return ({ id: a.id, mask: a.mask, tracking: 'Transactions' as TrackingType })
      })
      // .filter((a) => (a.tracking !== 'None' && a.tracking !== undefined));

    let response: unknown = null;

    if (institution) {
      response = await institution.update();
    }
    else {
      if (metadata.institution === null) {
        throw new Error('institution is null');
      }
      response = await accounts.addInstitution(
        publicToken, metadata.institution.institution_id,
      );
    }

    if (response) {
      setShow(false);
    }
  };

  // useEffect(() => {
  //   institution.getUnlinkedAccounts();
  // }, [institution]);

  const renderAccounts = () => (
    <>
      {
        metadata.accounts.map((acct, index) => (
          <Field
            key={acct.id}
            name={`tracking[${index}]`}
            account={acct}
            as={AccountItem}
          />
        ))
      }
      <ErrorMessage name="tracking" />
    </>
  );

  return (
    <FormModal<ValuesType>
      initialValues={{
        tracking: metadata.accounts.map(() => 'Transactions'),
        startDate: DateTime.now().startOf('month').toISODate() ?? '',
      }}
      setShow={setShow}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Accounts"
      formId="UnlinkedAccounts"
    >
      <FormField name="startDate" label="Start Date:" type="date" />
      <Observer>
        {renderAccounts}
      </Observer>
    </FormModal>
  );
};

const observedAccountsDialog = observer(AccountsDialog);

export const useAccountsDialog = makeUseModal<PropsType>(AccountsDialog);

export default observedAccountsDialog;
