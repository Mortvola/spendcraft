import React, {
  useEffect, useCallback, useContext, useState, ReactElement,
} from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import MobxStore from './State/mobxStore';
import { useAccountsDialog } from './AccountView/AccountsDialog';
import { InstitutionInterface } from './State/State';

type PropsType = {
  showAccountsDialog: (inst: InstitutionInterface) => void,
}

const PlaidLinkDialog = ({
  showAccountsDialog,
}: PropsType): null => {
  const { accounts } = useContext(MobxStore);

  const onEvent = (eventName: string) => {
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

  const onSuccess = useCallback(async (publicToken: unknown, metadata: unknown) => {
    if (accounts.plaid === null) {
      throw new Error('plaid is null');
    }

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

const PlaidLink = (): ReactElement | null => {
  const { accounts } = useContext(MobxStore);
  const [AccountsDialog, showAccountsDialog] = useAccountsDialog();
  const [institute, setInstitute] = useState<InstitutionInterface>();

  const handleShowDialog = (inst: InstitutionInterface) => {
    setInstitute(inst);
    showAccountsDialog();
  };

  if (accounts.plaid) {
    return <PlaidLinkDialog showAccountsDialog={handleShowDialog} />;
  }

  if (institute) {
    return <AccountsDialog institution={institute} />;
  }

  return null;
};

export default observer(PlaidLink);
