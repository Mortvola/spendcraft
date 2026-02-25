import React from 'react'
import { useStores } from '../State/Store';
import { observer } from 'mobx-react-lite';
import styles from './Users.module.scss'
import { DateTime } from 'luxon';

const Users: React.FC = observer(() => {
   const { users } = useStores();
 
  return (
    <>
    {
      users.users.map((user) => (
        <div key={user.username} className={styles.layout}>
          <div>{user.username}</div>
          <div>{user.email}</div>
          <div>{user.createdAt.toLocaleString(DateTime.DATETIME_FULL)}</div>
        </div>
      ))
    }
    </>
  )
})

export default Users;
