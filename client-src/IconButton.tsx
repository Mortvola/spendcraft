import React from 'react';
import Icon from './Icon';
import styles from './IconButton.module.css';

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
}) => (
  <button type="button" className={`btn btn-sm ${styles.layout} ${className ?? ''}`} onClick={onClick}>
    <Icon icon={icon} rotate={rotate} iconClass={iconClass} solid={solid} />
    <div>
      {
        caption
      }
    </div>
  </button>
);

export default IconButton;
