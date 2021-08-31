import React, { useState, ReactElement, useCallback } from 'react';

type ShowCallback = (() => void);
type OnSave = (() => void);
type OnHide = (() => void);
type OnConfirm = (() => void);

type UseModalType<T> = [
  (props: T) => (ReactElement | null),
  ShowCallback,
];

export interface ModalProps {
  show: boolean,
  setShow: (show: boolean) => void;
  onHide: OnHide,
  onConfirm?: OnConfirm,
}

function useModal<T>(
  Dialog: React.FC<T & ModalProps>,
  onSave?: OnSave,
): UseModalType<T> {
  const [showDialog, setShowDialog] = useState(false);

  const createDialog = useCallback((props: T & { onHide?: () => void }): ReactElement | null => {
    const handleHide = () => {
      if (props.onHide) {
        props.onHide();
      }
      setShowDialog(false);
    };

    const handleSave = () => {
      if (onSave) {
        onSave();
      }

      setShowDialog(false);
    };

    if (showDialog) {
      const props2 = {
        ...props,
        show: showDialog,
        setShow: setShowDialog,
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
  }, [Dialog, onSave, showDialog]);

  return [
    createDialog,
    () => setShowDialog(true),
  ];
}

export default useModal;
export { UseModalType };
