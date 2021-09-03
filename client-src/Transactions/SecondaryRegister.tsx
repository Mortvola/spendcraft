import React, { ReactElement } from 'react';

type PropsType = {
  title: string,
  titles: ReactElement,
  transactions: ReactElement,
}

const SecondaryRegister = ({
  title,
  titles,
  transactions,
}: PropsType): ReactElement => (
  <div className="pending window">
    <div className="pending-register-title">
      {title}
    </div>
    {titles}
    <div className="transactions striped">
      {transactions}
    </div>
  </div>
);

export default SecondaryRegister;
