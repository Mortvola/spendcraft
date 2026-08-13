import React from 'react';
import { FormField } from '@mortvola/forms';
import { FieldProps } from 'formik';
import { getSubtypes } from '../State/AccountTypes';

interface PropsType {
  name: string,
  label: string,
}
const AccountSubtypeField: React.FC<PropsType> = ({
  name,
  label,
}) => {
  const subtypeList = ({ field, form }: FieldProps<string>) => (
    <select
      name={field.name}
      value={field.value}
      className="form-control"
      onChange={field.onChange}
      onBlur={field.onBlur}
    >
      {
        (() => (
          getSubtypes(form.values.type).map((subtype) => (
            <option key={subtype.key} value={subtype.key}>{subtype.name}</option>
          ))
        ))()
      }
    </select>
  )

  return (
    <FormField name={name} label={label}>
      {subtypeList}
    </FormField>
  )
}

export default AccountSubtypeField;
