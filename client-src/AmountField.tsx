import React from 'react';
import { FieldProps } from 'formik';
import { FormField } from '@mortvola/forms';
import AmountInput from './AmountInput';

interface PropsType {
  name: string,
  label: string,
}

const AmountField: React.FC<PropsType> = ({
  name,
  label,
}) => (
  <FormField
    name={name}
    label={label}
  >
    {
      ({ field }: FieldProps<string | number>) => (
        <AmountInput
          className="form-control"
          {...field}
        />
      )
    }
  </FormField>
)

export default AmountField;
