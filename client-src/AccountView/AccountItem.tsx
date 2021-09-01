import React, { ReactElement, useState } from 'react';
import PropTypes from 'prop-types';
import Amount from '../Amount';
import { AccountInterface } from '../state/State';

type PropsType = {
  name: string,
  account: AccountInterface,
  onChange: ((event: React.ChangeEvent<HTMLSelectElement>) => void),
}

const AccountItem = ({
  name,
  account,
  onChange,
}: PropsType): ReactElement => {
  const [option, setOption] = useState('None');

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setOption(event.target.value);

    if (onChange) {
      onChange(event);
    }
  };

  return (
    <div className="account-select-item">
      <div className="account-name">
        {account.official_name ? account.official_name : account.name}
      </div>
      <div className="account-type">
        <label>Type:</label>
        <div>{account.subtype}</div>
      </div>
      <div className="account-balance">
        <label>Balance:</label>
        <Amount amount={account.balances.current} />
      </div>
      <div className="track-selection">
        <label>Account Tracking</label>
        <select name={name} value={option} onChange={handleChange}>
          <option value="None">None</option>
          <option value="Transactions">Categorized Transactions</option>
          <option value="Uncategorized Transactions">Uncategorized Transactions</option>
          <option value="Balances">Balances</option>
        </select>
      </div>
    </div>
  );
};

AccountItem.propTypes = {
  name: PropTypes.string.isRequired,
  account: PropTypes.shape({
    official_name: PropTypes.string,
    name: PropTypes.string,
    subtype: PropTypes.string,
    balances: PropTypes.shape({
      current: PropTypes.number,
    }),
  }).isRequired,
  onChange: PropTypes.func,
};

AccountItem.defaultProps = {
  onChange: null,
};

export default AccountItem;
