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
  const { uiState } = useContext(MobxStore);

  const onEvent = (eventName: string) => {
    if (eventName === 'HANDOFF') {
      runInAction(() => {
        uiState.plaid = null;
      });
    }
  };

  const onExit = useCallback((err, metaData) => {
    if (err) {
      console.log(err);
      console.log(JSON.stringify(metaData));
    }

    runInAction(() => {
      uiState.plaid = null;
    });
  }, [uiState]);

  const onSuccess = useCallback(async (publicToken: unknown, metadata: unknown) => {
    if (uiState.plaid === null) {
      throw new Error('plaid is null');
    }

    if (publicToken && uiState.plaid.callback) {
      const institute = await uiState.plaid.callback(publicToken, metadata);
      showAccountsDialog(institute);
    }
  }, [showAccountsDialog, uiState.plaid]);

  const { open, ready } = usePlaidLink({
    token: uiState.plaid.linkToken,
    onSuccess,
    onExit,
    onEvent,
  });

  useEffect(() => {
    if (uiState.plaid && open && ready) {
      open();
    }
  }, [uiState.plaid, open, ready]);

  return null;
};

const PlaidLink = (): ReactElement | null => {
  const { uiState } = useContext(MobxStore);
  const [AccountsDialog, showAccountsDialog] = useAccountsDialog();
  const [institute, setInstitute] = useState<InstitutionInterface>();

  const handleShowDialog = (inst: InstitutionInterface) => {
    setInstitute(inst);
    showAccountsDialog();
  };

  if (uiState.plaid) {
    return <PlaidLinkDialog showAccountsDialog={handleShowDialog} />;
  }

  if (institute) {
    return <AccountsDialog institution={institute} />;
  }

  return null;
};

export default observer(PlaidLink);
