import React, { ReactElement, ReactNode } from 'react';

type PropsType = {
  title: string,
  titles: ReactElement,
  children: ReactNode,
}

const SecondaryRegister = ({
  title,
  titles,
  children,
}: PropsType): ReactElement => (
  <div className="pending window">
    <div className="pending-register-title">
      {title}
    </div>
    {titles}
    <div className="transactions striped">
      {children}
    </div>
  </div>
);

export default SecondaryRegister;
