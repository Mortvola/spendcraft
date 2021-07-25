import React, { ReactElement } from 'react';
import { ErrorMessage } from 'formik';
import Errors from './Errors';

const FormError = ({ name }: { name: string }): ReactElement => (
  <ErrorMessage name={name}>
    {
      (msg) => (
        <span className="text-danger" role="alert">
          <Errors errors={[msg]} />
        </span>
      )
    }
  </ErrorMessage>
);

export default FormError;
