import React from 'react';
import { Spinner } from 'react-bootstrap';
import styles from './PleaseWait.module.css';

const PleaseWait: React.FC = () => (
  <div className={styles.pleaseWait}>
    <Spinner animation="border" />
  </div>
);

export default PleaseWait;
