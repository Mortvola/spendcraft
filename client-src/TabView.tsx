import React from 'react';
import {
  useNavigate, useParams,
} from 'react-router-dom';
import styles from './TabView.module.scss';
import TabViewButton from './TabViewButton';
import { useStores } from './State/mobxStore';

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
        onClick={handleOtherClick}
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
      <TabViewButton
        icon="circle-user"
        caption="Account"
        url="/user"
        onClick={handleOtherClick}
      />
    </div>
  )
};

export default TabView;
