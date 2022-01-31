import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import Institution from './Institution';
import MobxStore from '../State/mobxStore';
import { AccountInterface } from '../State/State';
import styles from './AccountView.module.css';

type PropsType = {
  opened: boolean,
  onAccountSelected: () => void,
}

const AccountView = ({
  opened,
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
      {
        institutions
          .filter((institution) => (opened ? institution.hasOpenAccounts() : institution.hasClosedAccounts()))
          .map((institution) => (
            <Institution
              key={institution.id}
              institution={institution}
              onAccountSelected={handleAccountSelected}
              selectedAccount={selectedAccount}
              opened={opened}
            />
          ))
      }
    </div>
  );
};

export default observer(AccountView);
