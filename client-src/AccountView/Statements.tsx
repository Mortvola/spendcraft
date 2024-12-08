import React from 'react';
import styles from './Statements.module.scss'
import Register from '../Transactions/Register';

const Statements: React.FC = () => (
  <div className={styles.layout}>
    <div className={styles.statements}>
      Statements
      <button type="button">Add</button>
    </div>
    <Register type="account" />
  </div>
)

export default Statements;
