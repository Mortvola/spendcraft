import React, { ReactElement } from 'react';
import { FormikContextType, useFormikContext } from 'formik';
import { Button } from 'react-bootstrap';

type PropsType<T> = {
  onDelete: ((context: FormikContextType<T>) => void),
}

function DeleteButton<T>({
  onDelete,
}: PropsType<T>): ReactElement {
  const bag = useFormikContext<T>();

  return (<Button variant="danger" onClick={() => onDelete(bag)}>Delete</Button>);
}

export default DeleteButton;
