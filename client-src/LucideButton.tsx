import React from 'react';
import styles from './LucideButton.module.scss';

interface PropsType {
  caption?: string;
  className?: string;
  rotate?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

const LucideButton = React.forwardRef<HTMLButtonElement, PropsType>(({
  caption,
  className,
  rotate,
  onClick,
  children,
}, ref) => {
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation()

    if (onClick) {
      onClick()
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      className={`btn btn-sm ${styles.layout} ${rotate ? styles.rotate : ''} ${className ?? ''}`}
      onClick={handleClick}
    >
      { children }
      <div>
        {
          caption
        }
      </div>
    </button>
  );
})

export default LucideButton;
