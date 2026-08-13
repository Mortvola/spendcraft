import { FormField } from '@mortvola/forms';
import React from 'react';
import { getSubtypes, getTypes } from '../State/AccountTypes';
import { FieldProps } from 'formik';

interface PropsType {
  name: string,
  label: string,
}

const AccountTypeField: React.FC<PropsType> = ({
  name,
  label,
}) => {
  const typelist = ({ field, form }: FieldProps<string>) => (
    <select
      name={field.name}
      value={field.value}
      className="form-control"
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
        const subTypes = getSubtypes(e.target.value);

        if (subTypes.length > 0) {
          form.setFieldValue('subtype', subTypes[0].key, false);
        }

        field.onChange(e);
      }}
      onBlur={field.onBlur}
    >
      {
        getTypes().map((t) => (
          <option key={t.key} value={t.key}>{t.name}</option>
        ))
      }
    </select>
  )
  
  return (
    <FormField name={name} label={label}>
      {typelist}
    </FormField>
  )
}

export default AccountTypeField;
