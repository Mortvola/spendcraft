import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import Institution from './Institution';
import MobxStore from '../state/mobxStore';
import { AccountInterface } from '../state/State';

const AccountView = () => {
  const { accounts, uiState } = useContext(MobxStore);
  const { selectedAccount } = uiState;
  const { institutions } = accounts;

  const handleAccountSelected = (account: AccountInterface) => {
    uiState.selectAccount(account);
  };

  const handleRelink = (institutionId: number) => {
    accounts.relinkInstitution(institutionId);
  };

  return (
    <div id="accounts">
      {institutions.map((institution) => (
        <Institution
          key={institution.name}
          institution={institution}
          onAccountSelected={handleAccountSelected}
          selectedAccount={selectedAccount}
          onRelink={handleRelink}
        />
      ))}
    </div>
  );
};

export default observer(AccountView);
