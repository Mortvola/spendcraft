import React from 'react';
import PropTypes from 'prop-types';

const ResetEmailSentPanel = ({
  resetMessage,
}) => (
  <div className="alert alert-success" role="alert">{resetMessage}</div>
);

ResetEmailSentPanel.propTypes = {
  resetMessage: PropTypes.string,
};

ResetEmailSentPanel.defaultProps = {
  resetMessage: null,
};

export default ResetEmailSentPanel;
