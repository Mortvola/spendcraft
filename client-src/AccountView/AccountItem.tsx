import React, { useState } from 'react';

interface PropsType {
  name: string,
  label?: string,
  value: string,
  onChange?: ((event: React.ChangeEvent<HTMLSelectElement>) => void) | null,
}

const AccountItem: React.FC<PropsType> = ({
  name,
  label,
  value,
  onChange = null,
}) => {
  const [option, setOption] = useState(value);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setOption(event.target.value);

    if (onChange) {
      onChange(event);
    }
  };

  return (
    <label style={{ marginTop: '0.5rem' }}>
      {label}
      <select className="form-control" name={name} value={option} onChange={handleChange} style={{ height: '2.5rem' }}>
        <option value="Transactions">Categorized</option>
        <option value="Uncategorized Transactions">Uncategorized</option>
        {/* <option value="Balances">Balances</option> */}
      </select>
    </label>
  );
};

export default AccountItem;
