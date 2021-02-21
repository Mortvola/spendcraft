import React, { useState, ReactElement } from 'react';

type ShowCallback = (() => void);
type OnSave = (() => void);
type OnHide = (() => void);
type OnConfirm = (() => void);

export interface ModalProps {
  show: boolean,
  onHide: OnHide,
  onConfirm: OnConfirm,
}

function useModal<T>(
  Dialog: React.FC<T & ModalProps>,
  onSave?: OnSave,
): [(props: T) => ReactElement | null, ShowCallback] {
  const [show, setShow] = useState(false);

  const handleHide = () => {
    setShow(false);
  };

  const handleSave = () => {
    if (onSave) {
      onSave();
    }

    handleHide();
  };

  const createDialog = (props: T): ReactElement | null => {
    if (show) {
      const props2 = {
        ...props,
        show,
        onHide: handleHide,
        onConfirm: handleSave,
      };

      return (
        <Dialog
          {...props2}
        />
      );
    }

    return null;
  };

  return [
    createDialog,
    () => setShow(true),
  ];
}

export default useModal;
