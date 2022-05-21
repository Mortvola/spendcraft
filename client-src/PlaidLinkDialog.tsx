import React from 'react';
import { runInAction } from 'mobx';
import { usePlaidLink } from 'react-plaid-link';
import MobxStore from './State/mobxStore';
import { InstitutionInterface } from './State/State';

type PropsType = {
  showAccountsDialog: (inst: InstitutionInterface) => void,
}

const PlaidLinkDialog: React.FC<PropsType> = ({
  showAccountsDialog,
}) => {
  const { uiState } = React.useContext(MobxStore);

  const onEvent = (eventName: string) => {
    console.log(`plaid event: ${eventName}`);
    // if (eventName === 'HANDOFF') {
    //   runInAction(() => {
    //     uiState.plaid = null;
    //   });
    // }
  };

  const onExit = React.useCallback((err: unknown, metaData: unknown) => {
    if (err) {
      console.log(err);
      console.log(JSON.stringify(metaData));
    }

    runInAction(() => {
      uiState.plaid = null;
    });
  }, [uiState]);

  const onSuccess = React.useCallback(async (publicToken: unknown, metadata: unknown) => {
    if (uiState.plaid === null) {
      throw new Error('plaid is null');
    }

    if (publicToken && uiState.plaid.callback) {
      const institute = await uiState.plaid.callback(publicToken, metadata);
      showAccountsDialog(institute);
    }

    runInAction(() => {
      uiState.plaid = null;
    });
  }, [showAccountsDialog, uiState]);

  const { open, ready } = usePlaidLink({
    token: uiState.plaid.linkToken,
    onSuccess,
    onExit,
    onEvent,
  });

  React.useEffect(() => {
    if (uiState.plaid && open && ready) {
      open();
    }
  }, [uiState.plaid, open, ready]);

  return null;
};

export default PlaidLinkDialog;
