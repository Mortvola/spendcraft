import React from 'react';
import Icon from './Icon';
import styles from './IconButton.module.scss';

type PropsType = {
  icon: string;
  caption?: string;
  rotate?: boolean;
  className?: string;
  iconClass?: string,
  solid?: boolean,
  onClick?: () => void;
}

const IconButton: React.FC<PropsType> = ({
  icon,
  caption,
  rotate = false,
  className,
  iconClass,
  solid = true,
  onClick,
}) => {
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation()

    if (onClick) {
      onClick()
    }
  }

  return (
    <button type="button" className={`btn btn-sm ${styles.layout} ${className ?? ''}`} onClick={handleClick}>
      <Icon icon={icon} rotate={rotate} iconClass={iconClass} solid={solid} />
      <div>
        {
          caption
        }
      </div>
    </button>
  );
}

export default IconButton;
