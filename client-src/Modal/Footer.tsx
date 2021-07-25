import React, { ReactElement } from 'react';
import { FormikContextType } from 'formik';
import { Modal, Button } from 'react-bootstrap';
import DeleteButton from './DeleteButton';

type PropsType<T> = {
  handleDelete?: ((context: FormikContextType<T>) => void) | null,
  onHide: (() => void)
}

function Footer<T>({
  handleDelete,
  onHide,
}: PropsType<T>): ReactElement {
  return (
    <Modal.Footer>
      {
        handleDelete ? <DeleteButton<T> handleDelete={handleDelete} /> : <div />
      }
      <div />
      <Button variant="secondary" onClick={onHide}>Cancel</Button>
      <Button variant="primary" type="submit">Save</Button>
    </Modal.Footer>
  );
}

export default Footer;
