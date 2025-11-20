import React from 'react';
import styles from './NavigationView.module.scss';
import { ChevronLeft } from 'lucide-react';

interface PropsType {
  title: string,
  open: boolean,
  onClose: () => void,
  details: React.ReactNode,
  children: React.ReactNode,
  menu?: React.ReactNode,
}

const NavigationView: React.FC<PropsType> = ({
  title,
  open,
  onClose,
  details,
  children,
  menu,
}) => (
  <div className={styles.outerWrapper}>
    <div className={styles.titleWrapper} onClick={onClose}>
      <div className={`${styles.backButton} ${open ? 'open' : ''}`}><ChevronLeft /></div>
      <div className={styles.innerTitle}>
        <div className={`${styles.title} ${open ? 'open' : ''}`}>{title}</div>
        { menu }
      </div>
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
