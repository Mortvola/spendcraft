import React, { ReactElement, ReactNode, useState } from 'react';
import { Modal, Button } from 'react-bootstrap';

type Props = {
  onConfirm: () => void;
  children: ReactNode;
}

const DeleteConfirmation = ({
  onConfirm,
  onHide,
  show,
  children,
}: Props & ConfirmProps): ReactElement => (
  <Modal onHide={onHide} show={show}>
    <Modal.Header closeButton>
      <Modal.Title>
        Delete Confirmation
      </Modal.Title>
    </Modal.Header>
    <Modal.Body>
      {children}
    </Modal.Body>
    <Modal.Footer>
      <Button variant="secondary" onClick={onHide}>Cancel</Button>
      <Button variant="danger" onClick={onConfirm}>Delete</Button>
    </Modal.Footer>
  </Modal>
);

type HandleDeleteClick = (() => void);
type OnDelete = (() => void);

type ConfirmProps = {
  show: boolean;
  onHide: () => void;
}

function useDeleteConfirmation<T>(
  children: ReactNode,
  onDelete: OnDelete,
): [(props: T) => ReactElement | null, HandleDeleteClick] {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteClick = () => {
    setConfirmDelete(true);
  };

  const handleHide = () => {
    setConfirmDelete(false);
  };

  const handleConfirm = () => {
    onDelete();
    handleHide();
  };

  const createConfirmation = () => (
    <DeleteConfirmation
      show={confirmDelete}
      onHide={handleHide}
      onConfirm={handleConfirm}
    >
      {children}
    </DeleteConfirmation>
  );

  return [
    createConfirmation,
    handleDeleteClick,
  ];
}

export default DeleteConfirmation;
export { useDeleteConfirmation };
