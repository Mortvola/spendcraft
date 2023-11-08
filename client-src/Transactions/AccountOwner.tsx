import React from 'react';
import styles from './Transactions.module.scss';

type PropsType = {
  owner: string | null,
}

const AccountOwner: React.FC<PropsType> = ({
  owner = '',
}) => (
  <div className={styles.owner}>
    {owner?.toLocaleLowerCase()}
  </div>
)

export default AccountOwner;
