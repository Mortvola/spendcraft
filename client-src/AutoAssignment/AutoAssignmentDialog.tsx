import React from 'react';
import { FormField, FormModal } from '@mortvola/forms';
import { ModalProps, makeUseModal } from '@mortvola/usemodal';
import { FieldArray, FormikErrors } from 'formik';
import { Button } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import { AutoAssignmentInterface } from '../State/State';

let tempId = -1;

const nextTempid = () => {
  const id = tempId;
  tempId -= 1;

  return id;
}

type PropsType = {
  autoAssignment?: AutoAssignmentInterface
}

const AutoAssignmentDialog: React.FC<PropsType & ModalProps> = observer(({
  setShow,
  autoAssignment,
}) => {
  type ValueType = {
    name: string,
    searchStrings: { id: number, searchString: string }[],
  }

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    return errors;
  }

  const handleSubmit = async (values: ValueType) => {
    if (autoAssignment) {
      autoAssignment.update({ name: values.name, searchStrings: values.searchStrings })
    }
    else {
      console.log('submit new auto assignment')
    }

    setShow(false)
  }

  return (
    <FormModal<ValueType>
      initialValues={{
        name: autoAssignment?.name ?? '',
        searchStrings: (autoAssignment?.searchStrings ?? [{ id: nextTempid(), searchString: '' }])
          .map((s) => ({ id: s.id, searchString: s.searchString })),
      }}
      title={autoAssignment ? 'Edit Auto Assignment' : 'Add Auto Assignment'}
      setShow={setShow}
      validate={handleValidate}
      onSubmit={handleSubmit}
    >
      {
        (formikProps) => (
          <>
            <FormField name="name" label="Name" />
            <FieldArray
              name="searchStrings"
              render={
                (arrayHelpers) => (
                  formikProps.values.searchStrings.map((s, i) => (
                    <div key={s.id}>
                      <FormField name={`searchStrings[${i}].searchString`} />
                      <Button
                        onClick={
                          () => arrayHelpers.insert(i + 1, { id: nextTempid(), searchString: '' })
                        }
                      >
                        Add
                      </Button>
                      {
                        formikProps.values.searchStrings.length > 1
                          ? <Button onClick={() => arrayHelpers.remove(i)}>Delete</Button>
                          : null
                      }
                    </div>
                  ))
                )
              }
            />
          </>
        )
      }
    </FormModal>
  )
})

export const useAutoAssignmentDialog = makeUseModal<PropsType>(AutoAssignmentDialog, { size: 'lg' });

export default AutoAssignmentDialog;
