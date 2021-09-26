import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import Institution from './Institution';
import MobxStore from '../State/mobxStore';
import { AccountInterface } from '../State/State';
import styles from './AccountView.module.css';

type PropsType = {
  onAccountSelected: () => void,
}

const AccountView = ({
  onAccountSelected,
}: PropsType) => {
  const { accounts, uiState } = useContext(MobxStore);
  const { selectedAccount } = uiState;
  const { institutions } = accounts;

  const handleAccountSelected = (account: AccountInterface) => {
    uiState.selectAccount(account);
    if (onAccountSelected) {
      onAccountSelected();
    }
  };

  return (
    <div className={styles.accounts}>
      {institutions.map((institution) => (
        <Institution
          key={institution.name}
          institution={institution}
          onAccountSelected={handleAccountSelected}
          selectedAccount={selectedAccount}
        />
      ))}
    </div>
  );
};

export default observer(AccountView);
