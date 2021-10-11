import { DateTime } from 'luxon';
import React, { ReactElement } from 'react';

type PropsType = {
  date: DateTime,
  className?: string,
}

const Date = ({
  date,
  className,
}: PropsType): ReactElement => (
  <div className={className}>{date.toFormat('LL/dd/yy')}</div>
)

export default Date;
