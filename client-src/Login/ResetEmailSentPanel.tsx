import React from 'react';

type PropsType = {
  resetMessage: string;
}

const ResetEmailSentPanel: React.FC<PropsType> = ({
  resetMessage,
}) => (
  <div className="alert alert-success" role="alert">{resetMessage}</div>
);

export default ResetEmailSentPanel;
