import React, { useState } from 'react';

type ShowCallback = (() => void);
type OnSave = (() => void);
type OnHide = (() => void);
type OnConfirm = (() => void);

interface DialogProps {
  show: boolean,
  onHide: OnHide,
  onConfirm: OnConfirm,
}

function useModal<T>(
  Dialog: React.FC<T>,
  onSave?: OnSave,
): Array<React.FC<DialogProps & T> | ShowCallback> {
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

  const createDialog = (props: DialogProps & T) => {
    if (show) {
      return (
        <Dialog
          {...props}
          show={show}
          onHide={handleHide}
          onConfirm={handleSave}
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
