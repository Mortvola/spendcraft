import React from 'react';
import { Spinner } from 'react-bootstrap';
import styles from './Waiting.module.css';

type PropsType = {
  show?: boolean,
}

const Waiting: React.FC<PropsType> = ({
  show = true,
}) => (
  show
    ? (
      <div className={styles.waitBackground}>
        <Spinner
          animation="border"
          className={styles.absCentered}
          variant="light"
        />
      </div>
    )
    : null
);

export default Waiting;
