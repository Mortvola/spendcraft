import React from 'react';
import styles from './VerticalTitled.module.scss'

type PropsType = {
  title: string,
  underscored?: boolean,
  children: React.ReactNode,
}
const VerticalTitled: React.FC<PropsType> = ({
  title,
  underscored = true,
  children,
}) => (
  <div className={`${styles.verticalTitled} ${underscored ? styles.underscored : ''}`}>
    <div>
      {title}
    </div>
    {children}
  </div>
)

export default VerticalTitled;
