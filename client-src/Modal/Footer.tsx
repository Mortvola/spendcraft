import React, { ReactElement } from 'react';
import { FormikContextType } from 'formik';
import { Modal, Button } from 'react-bootstrap';
import DeleteButton from './DeleteButton';
import Errors from './Errors';
import styles from './Footer.module.css';

type PropsType<T> = {
  errors?: string[],
  onDelete?: ((context: FormikContextType<T>) => void) | null,
  setShow: (show: boolean) => void,
}

function Footer<T>({
  errors,
  onDelete,
  setShow,
}: PropsType<T>): ReactElement {
  const handleClick = () => {
    if (setShow) {
      setShow(false);
    }
  };

  return (
    <>
      <Modal.Footer className={styles.multiButtons}>
        {
          onDelete ? <DeleteButton<T> onDelete={onDelete} /> : <div />
        }
        <div />
        <Button variant="secondary" onClick={handleClick}>Cancel</Button>
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
