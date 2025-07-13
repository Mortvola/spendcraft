import { DateTime } from 'luxon';
import React from 'react';

interface PropsType {
  date: DateTime | null,
  className?: string,
}

const Date: React.FC<PropsType> = ({
  date,
  className,
}) => (
  date
    ? <div className={className}>{date.toFormat('LL/dd/yy')}</div>
    : null
)

export default Date;
