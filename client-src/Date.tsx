import { DateTime } from 'luxon';
import React from 'react';

type PropsType = {
  date: DateTime,
  className?: string,
}

const Date: React.FC<PropsType> = ({
  date,
  className,
}) => (
  <div className={className}>{date.toFormat('LL/dd/yy')}</div>
)

export default Date;
