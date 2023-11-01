import React from 'react';
import styles from './NavigationView.module.scss';

type PropsType = {
  title: string,
  open: boolean,
  onClose: () => void,
  details: React.ReactNode,
  children: React.ReactNode,
}

const NavigationView: React.FC<PropsType> = ({
  title,
  open,
  onClose,
  details,
  children,
}) => (
  <div className={styles.outerWrapper}>
    <div className={styles.titleWrapper} onClick={onClose}>
      <div className={`${styles.backButton} ${open ? 'open' : ''}`}>{'<'}</div>
      <div className={`${styles.title} ${open ? 'open' : ''}`}>{title}</div>
    </div>
    <div className={styles.wrapper}>
      { children }
      <div className={`${styles.offCanvas} ${open ? 'open' : ''}`}>
        { details }
      </div>
    </div>
  </div>
)

export default NavigationView;
