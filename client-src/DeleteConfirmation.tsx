import React, { ReactElement, ReactNode, useState } from 'react';
import { Modal, Button } from 'react-bootstrap';

interface PropsType {
  title: string,
  buttonTitle: string,
  onConfirm: () => void;
  children: ReactNode;
}

const Confirmation: React.FC<PropsType & ConfirmProps> = ({
  title,
  buttonTitle,
  onConfirm,
  onHide,
  show,
  children,
}) => (
  <Modal onHide={onHide} show={show}>
    <Modal.Header closeButton>
      <Modal.Title>
        {title}
      </Modal.Title>
    </Modal.Header>
    <Modal.Body>
      {children}
    </Modal.Body>
    <Modal.Footer>
      <Button variant="secondary" onClick={onHide}>Cancel</Button>
      <Button variant="danger" onClick={onConfirm}>{buttonTitle}</Button>
    </Modal.Footer>
  </Modal>
);

type HandleDeleteClick = (() => void);
type OnDelete = (() => void);

interface ConfirmProps {
  show: boolean;
  onHide: () => void;
}

function useDeleteConfirmation<T>(
  title: string,
  buttonTitle: string,
  children: ReactNode,
  onDelete: OnDelete,
): [(props: T) => ReactElement | null, HandleDeleteClick] {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleConfirmClick = () => {
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
    <Confirmation
      title={title}
      buttonTitle={buttonTitle}
      show={confirmDelete}
      onHide={handleHide}
      onConfirm={handleConfirm}
    >
      {children}
    </Confirmation>
  );

  return [
    createConfirmation,
    handleConfirmClick,
  ];
}

export default Confirmation;
export { useDeleteConfirmation };
