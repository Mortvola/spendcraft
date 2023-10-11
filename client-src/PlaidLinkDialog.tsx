import React from 'react';
import { runInAction } from 'mobx';
import { PlaidLinkOnSuccessMetadata, usePlaidLink } from 'react-plaid-link';
import { useStores } from './State/mobxStore';
import Console from './Console';

type PropsType = {
  showAccountsDialog: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void,
}

const PlaidLinkDialog: React.FC<PropsType> = ({
  showAccountsDialog,
}) => {
  const { uiState } = useStores();

  const onEvent = (eventName: string) => {
    Console.log(`plaid event: ${eventName}`);
    // if (eventName === 'HANDOFF') {
    //   runInAction(() => {
    //     uiState.plaid = null;
    //   });
    // }
  };

  const onExit = React.useCallback((err: unknown, metaData: unknown) => {
    if (err) {
      Console.log(err);
      Console.log(JSON.stringify(metaData));
    }

    runInAction(() => {
      uiState.plaid = null;
    });
  }, [uiState]);

  const onSuccess = React.useCallback(async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
    if (uiState.plaid === null) {
      throw new Error('plaid is null');
    }

    if (publicToken) {
      showAccountsDialog(publicToken, metadata);
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
