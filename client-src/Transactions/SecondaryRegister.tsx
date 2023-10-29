import React, { ReactElement, ReactNode } from 'react';
import styles from './SecondaryRegister.module.css';
import transactionStyles from './Transactions.module.css';
import useMediaQuery from '../MediaQuery';

type PropsType = {
  title: string,
  titles: ReactElement,
  children: ReactNode,
}

const SecondaryRegister: React.FC<PropsType> = ({
  title,
  titles,
  children,
}) => {
  const { isMobile } = useMediaQuery();

  return (
    <div className={`${styles.pending} window ${isMobile ? 'mobile' : ''}`}>
      <div className={styles.pendingRegisterTitle}>
        {title}
      </div>
      {titles}
      <div className={`${transactionStyles.transactions} striped`}>
        {children}
      </div>
    </div>
  );
}

export default SecondaryRegister;
