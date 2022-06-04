import React, { CSSProperties } from 'react';
import styles from './Icon.module.css'

type PropsType = {
  icon: string,
  iconClass?: string,
  rotate?: boolean,
  style?: CSSProperties,
  solid?: boolean,
}

const Icon: React.FC<PropsType> = ({
  icon,
  iconClass,
  rotate = false,
  style,
  solid = true,
}) => {
  let className = '';

  if (iconClass) {
    className += iconClass;
  }
  else {
    className += `${solid ? 'fas' : 'far'}`;
  }

  className += ` fa-${icon}`;

  if (rotate) {
    className += ` ${styles.rotate}`;
  }

  return (
    <i className={className} style={style} />
  )
};

export default Icon;
