import React, { ReactElement, ReactNode, useState } from 'react';
import { Modal, Button } from 'react-bootstrap';

interface PropsType {
  title: string,
  onNotified: () => void;
  children: ReactNode;
}

const Notification: React.FC<PropsType & ConfirmProps> = ({
  title,
  onNotified,
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
      <Button variant="danger" onClick={onNotified}>OK</Button>
    </Modal.Footer>
  </Modal>
);

type ShowNotification = (() => void);
type OnNotified = (() => void);

interface ConfirmProps {
  show: boolean;
  onHide: () => void;
}

function useNotification<T>(
  title: string,
  children: ReactNode,
  onNotified?: OnNotified,
): [(props: T) => ReactElement | null, ShowNotification] {
  const [notified, setNotified] = useState(false);

  const showNotification = () => {
    setNotified(true);
  };

  const handleHide = () => {
    setNotified(false);
  };

  const handleConfirm = () => {
    if (onNotified) {
      onNotified();
    }
    handleHide();
  };

  const createConfirmation = () => (
    <Notification
      title={title}
      show={notified}
      onHide={handleHide}
      onNotified={handleConfirm}
    >
      {children}
    </Notification>
  );

  return [
    createConfirmation,
    showNotification,
  ];
}

export default Notification;
export { useNotification };
