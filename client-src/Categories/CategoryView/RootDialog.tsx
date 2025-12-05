import React from 'react';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { FormModal, FormCheckbox } from '@mortvola/forms';
import { useStores } from '../../State/Store';
import styles from './RootDialog.module.scss';

const RootDialog: React.FC<ModalProps> = ({
  setShow,
}) => {
  const { uiState } = useStores();

  interface FormValues {
    showHidden: boolean,
  }

  const handleSubmit = async (values: FormValues) => {
    uiState.showHidden = values.showHidden;
    setShow(false);
  };

  const handleValidate = () => {
    return {}
  };

  return (
    <FormModal<FormValues>
      setShow={setShow}
      initialValues={{
        showHidden: uiState.showHidden,
      }}
      title="Category Settings"
      formId="GroupDialogForm"
      validate={handleValidate}
      onSubmit={handleSubmit}
    >
      <div className={styles.layout}>
        <FormCheckbox name="showHidden" label="Show hidden categories" />
      </div>
    </FormModal>
  );
};

export const useRootDialog = makeUseModal<object>(RootDialog);

export default RootDialog;
