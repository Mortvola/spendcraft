import React from 'react';
import styles from './Transactions.module.scss';
import useMediaQuery from '../MediaQuery';

type PropsType = {
  owner: string | null,
}

const AccountOwner: React.FC<PropsType> = ({
  owner = '',
}) => {
  const { addMediaClass } = useMediaQuery();

  return (
    <div
      className={addMediaClass(`${styles.transactionField} ${styles.transactionOwner}`)}
      style={{ textTransform: 'capitalize' }}
    >
      {owner?.toLocaleLowerCase()}
    </div>
  )
}

export default AccountOwner;
