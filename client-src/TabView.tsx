import React from 'react';
import styles from './TabView.module.scss';
import TabViewButton from './TabViewButton';

const TabView: React.FC = () => (
  <div className={styles.layout}>
    <TabViewButton
      icon="inbox"
      caption="Categories"
      url="/home"
    />
    <TabViewButton
      icon="map"
      caption="Plans"
      url="/plans"
    />
    <TabViewButton
      icon="building-columns"
      caption="Accounts"
      url="/accounts"
    />
    <TabViewButton
      icon="file"
      caption="Reports"
      url="/reports"
    />
    <TabViewButton
      icon="circle-user"
      caption="Account"
      url="/user"
    />
  </div>
)

export default TabView;
