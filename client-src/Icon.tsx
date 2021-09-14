import React, { CSSProperties, ReactElement } from 'react';
import styles from './Icon.module.css'

type PropsType = {
  icon: string,
  rotate?: boolean,
  style?: CSSProperties,
}

const Icon = ({
  icon,
  rotate = false,
  style,
}: PropsType): ReactElement => {
  let className = `fas fa-${icon}`;

  if (rotate) {
    className += ` ${styles.rotate}`;
  }

  return (
    <i className={className} style={style} />
  )
};

export default Icon;
