import React from 'react';
import {
  useNavigate, useParams,
} from 'react-router-dom';
import styles from './TabView.module.scss';
import TabViewButton from './TabViewButton';
import { useStores } from '../State/Store';
import TabViewMenu from './TabViewMenu';
import TabViewMenuItem from './TabViewMenuItem';

const TabView: React.FC = () => {
  const { uiState } = useStores();
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
    navigate('/overview');
  }

  const handleLogsClick = () => {
    navigate('/logs');
  }

  const handlePlansClick = () => {
    navigate('/plans')
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

  return (
    <div className={styles.layout}>
      <TabViewButton
        icon="inbox"
        caption="Categories"
        url="/home"
        onClick={handleCategoriesClick}
      />
      <TabViewButton
        icon="map"
        caption="Plans"
        url="/plans"
        onClick={handlePlansClick}
      />
      <TabViewButton
        icon="building-columns"
        caption="Accounts"
        url="/accounts"
        onClick={handleAccountsClick}
      />
      <TabViewButton
        icon="file"
        caption="Reports"
        url="/reports"
        onClick={handleOtherClick}
      />
      <TabViewMenu
        icon="ellipsis"
        caption="More"
      >
        <TabViewMenuItem onClick={handleAccountClick}>Account</TabViewMenuItem>
        <TabViewMenuItem onClick={handleBillsClick}>Bills</TabViewMenuItem>
        <TabViewMenuItem onClick={handleLogsClick}>Logs</TabViewMenuItem>
      </TabViewMenu>
    </div>
  )
};

export default TabView;
