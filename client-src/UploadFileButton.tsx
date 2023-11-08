import React, { ReactElement } from 'react';
import styles from './UploadFileButton.module.scss';

type PropsType = {
  onFileSelection: React.ChangeEventHandler<HTMLInputElement>,
  multiple?: boolean,
  accept?: string,
  label?: string,
  disabled?: boolean,
}

const UploadFileButton = ({
  onFileSelection,
  multiple,
  accept,
  label,
  disabled = false,
}: PropsType): ReactElement => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClick = () => {
    const inputElement = inputRef.current;

    if (inputElement) {
      inputElement.value = '';
      inputElement.click();
    }
  };

  return (
    <div className={styles.wrapper}>
      <button type="button" onClick={handleClick} disabled={disabled}>{label}</button>
      <input
        ref={inputRef}
        type="file"
        className={styles.input}
        accept={accept}
        multiple={multiple}
        onChange={onFileSelection}
      />
    </div>
  );
};

export default UploadFileButton;
