import React, { ChangeEvent, ReactElement, ReactNode } from 'react';
import {
  Field, FieldProps, useField, useFormikContext,
} from 'formik';
import styles from './FormRadio.module.css';

type PropsType<V, T> = {
  name: string,
  label?: string,
  value?: string,
  readOnly?: boolean,
  onChange?: (event: ChangeEvent<HTMLInputElement>, props: FieldProps<V, T>) => void,
  children?: ReactNode | ((props: FieldProps) => ReactNode),
};

function FormRadio<V = unknown, T = unknown>({
  name,
  label,
  value,
  readOnly,
  onChange,
  children,
}: PropsType<V, T>): ReactElement {
  const [field, meta] = useField<V>(name)
  const form = useFormikContext<T>();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    field.onChange(event);
    if (onChange) {
      onChange(event, { field, form, meta });
    }
  }

  let wrapperClassName = styles.childrenWrapper;
  if (typeof field.value !== 'string' || field.value !== value) {
    wrapperClassName += ` ${styles.notSelected}`;
  }

  return (
    <div className={styles.radioButton}>
      <label>
        <Field type="radio" name={name} value={value} readOnly={readOnly} onChange={handleChange} />
        {label}
      </label>
      <div className={wrapperClassName}>
        {
          typeof field.value === 'string' && field.value === value
            ? null
            : <div className={styles.mask} />
        }
        {
          typeof children === 'function'
            ? children({ field, form, meta })
            : children
        }
      </div>
    </div>
  );
}

export default FormRadio;
