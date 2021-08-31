import React, { ReactElement, ReactNode } from 'react';

type PropsType = {
  className: string,
  children: ReactNode,
}

const Transaction = ({
  className,
  children,
}: PropsType): ReactElement => (
  <div className={className}>
    {children}
  </div>
);

export default Transaction;
