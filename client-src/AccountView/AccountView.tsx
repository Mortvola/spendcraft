import React from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useParams } from 'react-router';
import Institution from './Institution';
import { useStores } from '../State/Store';
import { AccountInterface } from '../State/Types';
import styles from './AccountView.module.scss';

interface PropsType {
  opened: boolean,
  onAccountSelected?: () => void,
}

const AccountView: React.FC<PropsType> = observer(({
  opened,
  onAccountSelected,
}) => {
  const navigate = useNavigate();
  const params = useParams();
  const { accounts, uiState } = useStores();

  const handleAccountSelected = (account: AccountInterface) => {
    navigate(account.id.toString());

    if (onAccountSelected) {
      onAccountSelected();
    }
  };

  React.useEffect(() => {
    accounts.load();
  }, [accounts])

  React.useEffect(() => {
    if (accounts.initialized) {
      if (params.accountId !== undefined) {
        const acct = accounts.findAccount(parseInt(params.accountId, 10));

        if (acct && acct.closed === !opened) {
          uiState.selectAccount(acct);
        }
        else {
          navigate('/accounts');
        }
      }
      else {
        uiState.selectAccount(null);
      }
    }
  }, [accounts, accounts.initialized, accounts.institutions, navigate, opened, params, params.accountId, uiState]);

  const handleAccountStateChange = (account: AccountInterface) => {
    if (uiState.selectedAccount === account) {
      uiState.selectAccount(null);
    }
  };

  return (
    <div className={styles.accounts}>
      {
        accounts.institutions
          .filter((institution) => (opened ? institution.hasOpenAccounts() : institution.hasClosedAccounts()))
          .map((institution) => (
            <Institution
              key={institution.id}
              institution={institution}
              onAccountSelected={handleAccountSelected}
              onAccountStateChange={handleAccountStateChange}
              selectedAccount={uiState.selectedAccount}
              opened={opened}
            />
          ))
      }
    </div>
  );
});

export default AccountView;
