import React from 'react';
import styles from './IconButton.module.scss';

type PropsType = {
  caption?: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

const LucideButton: React.FC<PropsType> = ({
  caption,
  className,
  onClick,
  children,
}) => {
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation()

    if (onClick) {
      onClick()
    }
  }

  return (
    <button type="button" className={`btn btn-sm ${styles.layout} ${className ?? ''}`} onClick={handleClick}>
      { children }
      <div>
        {
          caption
        }
      </div>
    </button>
  );
}

export default LucideButton;
