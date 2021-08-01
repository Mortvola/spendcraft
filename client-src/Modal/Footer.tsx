import React, { ReactElement } from 'react';
import { FormikContextType } from 'formik';
import { Modal, Button } from 'react-bootstrap';
import DeleteButton from './DeleteButton';
import Errors from './Errors';

type PropsType<T> = {
  errors?: string[],
  handleDelete?: ((context: FormikContextType<T>) => void) | null,
  onHide: (() => void)
}

function Footer<T>({
  errors,
  handleDelete,
  onHide,
}: PropsType<T>): ReactElement {
  return (
    <>
      <Modal.Footer>
        {
          handleDelete ? <DeleteButton<T> handleDelete={handleDelete} /> : <div />
        }
        <div />
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button variant="primary" type="submit">Save</Button>
      </Modal.Footer>
      {
        errors
          ? <Errors style={{ padding: '0rem 1rem 1rem 1rem' }} errors={errors} />
          : null
      }
    </>
  );
}

export default Footer;
