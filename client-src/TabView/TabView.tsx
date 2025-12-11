import React from 'react';
import {
  useNavigate, useParams,
} from 'react-router';
import { observer } from 'mobx-react-lite';
import {
  Ellipsis,
  File, Inbox, Landmark, Receipt,
} from 'lucide-react';
import styles from './TabView.module.scss';
import TabViewButton from './TabViewButton';
import { useStores } from '../State/Store';
import TabViewMenu from './TabViewMenu';
import TabViewMenuItem from './TabViewMenuItem';

const TabView: React.FC = observer(() => {
  const { uiState, user } = useStores();
  const navigate = useNavigate();
  const params = useParams();

  const handleCategoriesClick = () => {
    if (uiState.selectedCategory !== undefined && uiState.selectedCategory !== null) {
      if (params.categoryId === undefined || parseInt(params.categoryId, 10) !== uiState.selectedCategory.id) {
        navigate(`/home/${uiState.selectedCategory.id}`)
      }
      else {
        navigate('/home');
      }
    }
    else {
      navigate('/home');
    }
  }

  const handleAccountClick = () => {
    navigate('/user');
  }

  const handleBillsClick = () => {
    navigate('/bills');
  }

  const handleLogsClick = () => {
    navigate('/logs');
  }

  const handlePlaidLogsClick = () => {
    navigate('/admin');
  }

  // const handlePlansClick = () => {
  //   navigate('/plans')
  // }

  const handleAutoAssignClick = () => {
    navigate('/auto-assignments');
  }

  const handleSearchClick = () => {
    navigate('/search')
  }

  const handleOtherClick = () => {
    console.log('not implemented');
  }

  const handleAccountsClick = () => {
    if (uiState.selectedAccount !== undefined && uiState.selectedAccount !== null) {
      if (params.accountId === undefined || parseInt(params.accountId, 10) !== uiState.selectedAccount.id) {
        navigate(`/accounts/${uiState.selectedAccount.id}`)
      }
      else {
        navigate('/accounts');
      }
    }
    else {
      navigate('/accounts');
    }
  }

  const handleSignOutClick = () => {
    (async () => {
      const signedOut = await user.signOut()

      if (signedOut) {
        navigate('/');
      }
    })()
  }

  return (
    <div className={styles.layout}>
      <TabViewButton
        icon={<Inbox size={24} strokeWidth={1} />}
        caption="Categories"
        url="/home"
        onClick={handleCategoriesClick}
      />
      <TabViewButton
        icon={<Receipt size={24} strokeWidth={1} />}
        caption="Bills"
        url="/bills"
        onClick={handleBillsClick}
      />
      <TabViewButton
        icon={<Landmark size={24} strokeWidth={1} />}
        caption="Accounts"
        url="/accounts"
        onClick={handleAccountsClick}
      />
      <TabViewButton
        icon={<File size={24} strokeWidth={1} />}
        caption="Reports"
        url="/reports"
        onClick={handleOtherClick}
      />
      <TabViewMenu
        icon={<Ellipsis size={24} strokeWidth={1} />}
        caption="More"
      >
        <TabViewMenuItem onClick={handleAccountClick}>Account</TabViewMenuItem>
        <TabViewMenuItem onClick={handleAutoAssignClick}>Auto Assign</TabViewMenuItem>
        <TabViewMenuItem onClick={handleSearchClick}>Search</TabViewMenuItem>
        <TabViewMenuItem onClick={handleLogsClick}>Logs</TabViewMenuItem>
        <TabViewMenuItem onClick={handleSignOutClick}>Sign Out</TabViewMenuItem>
        {
          user.roles.includes('ADMIN')
            ? (
              <TabViewMenuItem onClick={handlePlaidLogsClick}>Plaid Logs</TabViewMenuItem>
            )
            : null
        }
      </TabViewMenu>
    </div>
  )
});

export default TabView;
