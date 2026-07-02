import React from 'react';
import {
  Field,
  FormikHelpers,
  FormikErrors,
  FormikContextType,
  FieldProps,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { FormModal, FormError, setFormErrors } from '@mortvola/forms';
import { useStores } from '../../State/Store';
import { ErrorProps, GroupType } from '../../../common/ResponseTypes';
import { CategoryInterface, GroupInterface } from '../../State/Types';
import styles from './GroupDialog.module.scss';
import { isGroup } from '../../State/Group';
import Select, { components, OptionProps } from 'react-select';

interface PropsType {
  group?: GroupInterface,
}

const GroupDialog: React.FC<PropsType & ModalProps> = ({
  setShow,
  group,
}) => {
  const { categoryTree } = useStores();

  interface ValueType {
    name: string,
    parentGroupId: number | null,
  }

  const handleSubmit = async (values: ValueType, formikHelpers: FormikHelpers<ValueType>) => {
    const { setErrors } = formikHelpers;
    let errors: ErrorProps[] | null = null;

    let parentGroupId = categoryTree.budget.id;

    if (typeof values.parentGroupId === 'string') {
      parentGroupId = parseInt(values.parentGroupId, 10)
    }
    else if (values.parentGroupId !== null) {
      parentGroupId = values.parentGroupId
    }

    if (group) {
      errors = await group.update({ name: values.name, parentGroupId });
    }
    else {
      errors = await categoryTree.addGroup(values.name, parentGroupId);
    }

    if (errors) {
      setFormErrors(setErrors, errors);
    }
    else {
      setShow(false);
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.name === '') {
      errors.name = 'The group name must not be blank.';
    }

    return errors;
  };

  const handleDelete = async (bag: FormikContextType<ValueType>) => {
    const { setErrors } = bag;

    if (group) {
      const errors = await group.delete();

      if (errors) {
        setFormErrors(setErrors, errors);
      }
      else {
        setShow(false);
      }
    }
  };

  const title = () => {
    if (group) {
      return 'Edit Group';
    }

    return 'Add Group';
  };

  interface OptionType { value: number, label: string, level: number }

  const populateGroups = (root: GroupInterface): OptionType[] => {
    const options: OptionType[] = [];

    options.push({ value: root.id, label: root.name, level: 0 })

    let stack: { group: (GroupInterface | CategoryInterface), level: number }[] = root.children.map((child) => ({
      group: child,
      level: 1,
    }))

    while (stack.length > 0) {
      const { group: g, level} = stack[0];
      stack = stack.slice(1)

      if (isGroup(g) && g.type === GroupType.Regular) {
        if (group === undefined || g.id !== group.id) {
          options.push({ value: g.id, label: g.name, level: level })
        }

        stack = [
          ...g.children.map((child) => ({ group: child, level: level + 1 })),
          ...stack,
        ]
      }
    }

    return options
  }

  return (
    <FormModal<ValueType>
      setShow={setShow}
      initialValues={{
        name: group?.name ?? '',
        parentGroupId: group?.group?.id ?? categoryTree.budget.id,
      }}
      title={title()}
      formId="GroupDialogForm"
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={group ? handleDelete : null}
    >
      <div className={styles.layout}>
        <label>
          Group:
          <Field
            type="text"
            className="form-control"
            name="name"
          />
          <FormError name="name" />
        </label>

        <label>
          Parent Group:
          <Field
            className="form-control"
            name="parentGroupId"
          >
            {
              ({ field, form }: FieldProps<number>) => {
                const options = [
                  ...populateGroups(categoryTree.budget),
                  ...populateGroups(categoryTree.bills)
                ]

                const Option = (props: OptionProps<OptionType>) => (
                  <components.Option {...props}>
                    <div style={{ color: 'black', paddingLeft: props.data.level * 14, textWrap: 'nowrap' }}>{props.data.label}</div>
                  </components.Option>
                )

                return (
                  <Select<OptionType>
                    name={field.name}
                    value={options.find((o) => o.value === field.value)}
                    options={options}
                    components={{ Option }}
                    onChange={(v) => {
                      if (v !== null) {
                        form.setFieldValue(field.name, v.value);
                      }
                    }}
                    menuPortalTarget={document.body}
                    menuPosition="absolute"
                    menuPlacement="auto"
                    styles={{ menuPortal: (base) => ({ ...base, zIndex: 2000 }) }}
                    menuShouldScrollIntoView={false}
                    isSearchable={false}
                  />
                )
              }
            }
          </Field>
          <FormError name="group" />
        </label>
      </div>
    </FormModal>
  );
};

export const useGroupDialog = makeUseModal<PropsType>(GroupDialog);

export default GroupDialog;
