import React, {
  useEffect, useCallback, useContext, useState,
} from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import MobxStore from './State/mobxStore';
import { useAccountsDialog } from './AccountView/AccountsDialog';

const PlaidLinkDialog = ({
  showAccountsDialog,
}) => {
  const { accounts } = useContext(MobxStore);

  const onEvent = (eventName) => {
    console.log(`${eventName}`);
    if (eventName === 'HANDOFF') {
      runInAction(() => {
        accounts.plaid = null;
      });
    }
  };

  const onExit = useCallback((err, metaData) => {
    if (err) {
      console.log(err);
      console.log(JSON.stringify(metaData));
    }

    runInAction(() => {
      accounts.plaid = null;
    });
  }, [accounts]);

  const onSuccess = useCallback(async (publicToken, metadata) => {
    if (publicToken && accounts.plaid.callback) {
      const institute = await accounts.plaid.callback(publicToken, metadata);
      showAccountsDialog(institute);
    }
  }, [accounts, showAccountsDialog]);

  const { open, ready } = usePlaidLink({
    token: accounts.plaid.linkToken,
    onSuccess,
    onExit,
    onEvent,
  });

  useEffect(() => {
    if (accounts.plaid && open && ready) {
      open();
    }
  }, [accounts.plaid, open, ready]);

  return null;
};

const PlaidLink = () => {
  const { accounts } = useContext(MobxStore);
  const [AccountsDialog, showAccountsDialog] = useAccountsDialog();
  const [institute, setInstitute] = useState();

  const handleShowDialog = (inst) => {
    setInstitute(inst);
    showAccountsDialog();
  };

  if (accounts.plaid) {
    return <PlaidLinkDialog showAccountsDialog={handleShowDialog} />;
  }

  return <AccountsDialog institution={institute} />;
};

export default observer(PlaidLink);
