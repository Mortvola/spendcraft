import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  Field, ErrorMessage, FormikErrors,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { FormModal, FormField } from '@mortvola/forms';
import { DateTime } from 'luxon';
import AccountItem from './AccountItem';
import { AccountInterface } from '../State/Types';
import { TrackingType } from '../../common/ResponseTypes';

interface PropsType {
  account: AccountInterface | null,
}

const AccountsDialog: React.FC<PropsType & ModalProps> = ({
  account,
  setShow,
}) => {
  interface ValuesType {
    tracking: TrackingType,
    startDate: string,
  }

  const handleValidate = (_values: ValuesType) => {
    const errors: FormikErrors<ValuesType> = {};
    // if (!values.tracking.some((s) => s !== TrackingType.None)) {
    //   errors.tracking = 'No tracking options selected';
    // }

    // if (values.startDate === '') {
    //   errors.startDate = 'Start is required';
    // }

    return errors;
  };

  const handleSubmit = async (values: ValuesType) => {
    // if (!institution.unlinkedAccounts) {
    //   throw new Error('unlinkedAccounts is undefined');
    // }

    // const accountTracking: AccountTrackingProps[] = accounts
    //   .map((a, i) => {
    //     if (values.tracking === null) {
    //       throw new Error('account selections is null');
    //     }

    //     if (values.tracking[i]) {
    //       return ({ id: a.id, mask: a.mask, tracking: values.tracking[i] })
    //     }

    //     return ({ id: a.id, mask: a.mask, tracking: TrackingType.Transactions })
    //   })
    //   // .filter((a) => (a.tracking !== TrackingType.None && a.tracking !== undefined));

    // const response: unknown = null;

    // if (institution) {
    //   response = await institution.update();
    // }
    // else {
    //   if (metadata.institution === null) {
    //     throw new Error('institution is null');
    //   }
    //   response = await accounts.addInstitution(
    //     publicToken, metadata.institution.institution_id,
    //   );
    // }

    if (account) {
      account.setSettings({
        startDate: DateTime.fromISO(values.startDate),
        tracking: values.tracking,
      });
    }

    setShow(false);
    // }
  };

  // useEffect(() => {
  //   institution.getUnlinkedAccounts();
  // }, [institution]);

  return (
    <FormModal<ValuesType>
      initialValues={{
        tracking: account?.tracking ?? TrackingType.Transactions,
        startDate: account?.startDate?.toISODate() ?? '',
      }}
      setShow={setShow}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Account Settings"
      formId="UnlinkedAccounts"
    >
      {/* <Field
        key={account.id}
        name="tracking"
        account={account}
        as={AccountItem}
      /> */}
      {/* <div className="account-select-item"> */}
      <div className="account-name">
        {account?.name}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '1rem', justifyItems: 'start',
      }}
      >
        <FormField name="startDate" label="Start Date:" type="date" style={{ height: '2.5rem' }} />
        <Field
          name="tracking"
          label="Tracking:"
          as={AccountItem}
        />
      </div>
      {/* </div> */}
      <ErrorMessage name="tracking" />
    </FormModal>
  );
};

const observedAccountsDialog = observer(AccountsDialog);

export const useAccountsDialog = makeUseModal<PropsType>(AccountsDialog);

export default observedAccountsDialog;
