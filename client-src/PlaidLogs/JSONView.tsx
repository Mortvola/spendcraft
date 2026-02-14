import React from 'react';
import styles from './JSONView.module.scss';

interface PropsType {
  json: unknown,
}

const JSONView: React.FC<PropsType> = ({
  json,
}) => (
  <div className={styles.responseWrapper}>
    <div className={styles.response}>{JSON.stringify(json, null, 4)}</div> 
  </div>
)

export default JSONView;
