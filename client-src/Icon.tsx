import React, { CSSProperties, ReactElement } from 'react';
import styles from './Icon.module.css'

type PropsType = {
  icon: string,
  rotate?: boolean,
  style?: CSSProperties,
  solid?: boolean,
}

const Icon = ({
  icon,
  rotate = false,
  style,
  solid = true,
}: PropsType): ReactElement => {
  let className = `${solid ? 'fas' : 'far'} fa-${icon}`;

  if (rotate) {
    className += ` ${styles.rotate}`;
  }

  return (
    <i className={className} style={style} />
  )
};

export default Icon;
