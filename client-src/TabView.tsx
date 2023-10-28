import React from 'react';
import IconButton from './IconButton';
import styles from './TabView.module.css';

const TabView: React.FC = () => (
  <div className={styles.layout}>
    <IconButton icon="inbox" caption="Categories" className={styles.icon} iconClass="fa-solid" />
    <IconButton icon="map" caption="Plans" className={styles.icon} iconClass="fa-solid" />
    <IconButton icon="building-columns" caption="Accounts" className={styles.icon} iconClass="fa-solid" />
    <IconButton icon="file" caption="Reports" className={styles.icon} iconClass="fa-solid" />
    <IconButton icon="circle-user" caption="Account" className={styles.icon} iconClass="fa-solid" />
  </div>
);

export default TabView;
