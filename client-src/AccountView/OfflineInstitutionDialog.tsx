import {
  FormikErrors,
} from 'formik';
import React from 'react';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import {
  FormField, FormModal,
} from '@mortvola/forms';
import { InstitutionInterface } from '../State/Types';

interface PropsType {
  institution: InstitutionInterface,
}

const OfflineInstitutionDialog: React.FC<PropsType & ModalProps> = ({
  institution,
  setShow,
}) => {
  interface ValuesType {
    name: string,
  }

  const handleValidate = (values: ValuesType) => {
    const errors: FormikErrors<ValuesType> = {};

    if (!values.name) {
      errors.name = 'Institution name is required';
    }

    return errors;
  };

  const handleSubmit = async (values: ValuesType) => {
    // const { setErrors } = bag;

    // let errors: ErrorProps[] | null = null;

    await institution.updateOfflineInstitution(values.name);

    // if (errors) {
    //   setFormErrors(setErrors, errors);
    // }
    // else {
      setShow(false);
    // }
  };

  return (
    <FormModal<ValuesType>
      initialValues={{
        name: institution.name,
      }}
      setShow={setShow}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Edit Offline Institution"
      formId="UnlinkedAccounts"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(45%, 1fr))',
          gridGap: '0.5rem',
        }}
      >
        <FormField name="name" label="Institution Name:" />
      </div>
    </FormModal>
  );
}

export const useOfflineInstitutionDialog = makeUseModal<PropsType>(OfflineInstitutionDialog);

export default OfflineInstitutionDialog;
