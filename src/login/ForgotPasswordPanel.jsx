import React from 'react';
import PropTypes from 'prop-types';
import Errors from './Errors';

const ForgotPasswordPanel = ({
  onHide,
  onRememberedPasswordClick,
  requestResetLink,
  errors,
}, forwardRef) => (
  <form ref={forwardRef}>
    <div className="form-group row">
      <label htmlFor="email" className="col-md-3 col-form-label text-md-right">E-Mail Address</label>

      <div className="col-md-8">
        <input type="email" className="form-control" name="email" defaultValue="" required autoComplete="email" />

        <span className="text-danger" role="alert">
          <Errors errors={errors.email} />
        </span>
      </div>
    </div>

    <div className="form-group row mb-0">
      <div className="col-md-8 offset-md-3">
        <button type="button" className="btn btn-primary" onClick={requestResetLink}>
          Send Password Reset Link
        </button>
        <button type="button" className="btn" onClick={onHide}>Cancel</button>

        <span className="text-danger" role="alert">
          <Errors errors={errors.general} />
        </span>
      </div>
    </div>

    <div className="form-group row mb-0">
      <div className="col-md-8 offset-md-3">
        <div onClick={onRememberedPasswordClick} className="text-link">
          Oh, wait! I remember my password.
        </div>
      </div>
    </div>
  </form>
);

ForgotPasswordPanel.propTypes = {
  onRememberedPasswordClick: PropTypes.func.isRequired,
  requestResetLink: PropTypes.func.isRequired,
  onHide: PropTypes.func.isRequired,
  errors: PropTypes.shape().isRequired,
};

export default React.forwardRef(ForgotPasswordPanel);
