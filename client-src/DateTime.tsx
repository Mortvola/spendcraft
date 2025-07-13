import * as luxon from 'luxon';
import React from 'react';

interface PropsType {
  dateTime: luxon.DateTime,
  className?: string,
}

const DateTime: React.FC<PropsType> = ({
  dateTime,
  className,
}) => (
  <div className={className}>{dateTime.toFormat('LL/dd/yy hh:mm:ss a')}</div>
)

export default DateTime;
