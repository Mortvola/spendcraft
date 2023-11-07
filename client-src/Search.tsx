import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from './State/mobxStore';
import PostedRegister from './Transactions/PostedRegister';
import trxStyles from './Transactions/Transactions.module.scss';
import styles from './Search.module.scss';

const Search: React.FC = observer(() => {
  const { searcher } = useStores();
  const [searchString, setSearchString] = React.useState<string>('');

  const handleSearchClick = () => {
    searcher.transactions.getTransactions(0, `name=${searchString}`);
  }

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    setSearchString(event.target.value);
  }

  return (
    <div className={styles.layout}>
      <div className={styles.form}>
        <input value={searchString} onChange={handleChange} />
        <button type="button" onClick={handleSearchClick}>
          Search
        </button>
      </div>
      <div className={`${trxStyles.registerWrapper} ${trxStyles.search}`}>
        <PostedRegister
          type="account"
          trxContainer={searcher.transactions}
          category={null}
          account={null}
        />
      </div>
    </div>
  )
});

export default Search;
