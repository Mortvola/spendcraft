import React, { ReactElement } from 'react';

type PropsType = {
  icon: string,
  rotate?: boolean,
}

const Icon = ({
  icon,
  rotate = false,
}: PropsType): ReactElement => {
  let className = `fas fa-${icon}`;

  if (rotate) {
    className += ' rotate';
  }

  return (
    <i className={className} />
  )
};

export default Icon;
