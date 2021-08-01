import React, { ReactElement } from 'react';
import { FormikContextType, useFormikContext } from 'formik';
import { Button } from 'react-bootstrap';

type PropsType<T> = {
  handleDelete: ((context: FormikContextType<T>) => void),
}

function DeleteButton<T>({
  handleDelete,
}: PropsType<T>): ReactElement {
  const bag = useFormikContext<T>();

  return (<Button variant="danger" onClick={() => handleDelete(bag)}>Delete</Button>);
}

export default DeleteButton;
