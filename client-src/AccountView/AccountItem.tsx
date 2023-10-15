import React, { useState } from 'react';
import { PlaidAccount } from 'react-plaid-link';

type PropsType = {
  name: string,
  account: PlaidAccount,
  onChange?: ((event: React.ChangeEvent<HTMLSelectElement>) => void) | null,
}

const AccountItem: React.FC<PropsType> = ({
  name,
  account,
  onChange = null,
}) => {
  const [option, setOption] = useState('Transactions');

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setOption(event.target.value);

    if (onChange) {
      onChange(event);
    }
  };

  return (
    <div className="account-select-item">
      <div className="account-name">
        {account.name}
      </div>
      <div className="account-type">
        <label>Type:</label>
        <div>{account.subtype}</div>
      </div>
      {/* <div className="account-balance">
        <label>Balance:</label>
        <Amount amount={account.balances.current} />
      </div> */}
      <div className="track-selection">
        <label>Account Tracking</label>
        <select name={name} value={option} onChange={handleChange}>
          <option value="Transactions">Categorized Transactions</option>
          <option value="Uncategorized Transactions">Uncategorized Transactions</option>
          <option value="Balances">Balances</option>
        </select>
      </div>
    </div>
  );
};

export default AccountItem;
