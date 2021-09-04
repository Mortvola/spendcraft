import React, { ReactElement, useState } from 'react';
import { UnlinkedAccountProps } from '../../common/ResponseTypes';
import Amount from '../Amount';

type PropsType = {
  name: string,
  account: UnlinkedAccountProps,
  onChange?: ((event: React.ChangeEvent<HTMLSelectElement>) => void) | null,
}

const AccountItem = ({
  name,
  account,
  onChange = null,
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
        {account.officialName ?? account.name}
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

export default AccountItem;
