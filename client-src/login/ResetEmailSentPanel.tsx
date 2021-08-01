import React, { ReactElement } from 'react';
import PropTypes from 'prop-types';

type PropsType = {
  resetMessage: string;
}
const ResetEmailSentPanel = ({
  resetMessage,
}: PropsType): ReactElement => (
  <div className="alert alert-success" role="alert">{resetMessage}</div>
);

ResetEmailSentPanel.propTypes = {
  resetMessage: PropTypes.string,
};

ResetEmailSentPanel.defaultProps = {
  resetMessage: null,
};

export default ResetEmailSentPanel;
