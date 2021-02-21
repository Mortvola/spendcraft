import React from 'react';
import PropTypes from 'prop-types';
import Errors from './Errors';

const LoginPanel = ({
  onHide,
  onLogin,
  onForgotPasswordClick,
  errors,
}, forwardRef) => (
  <form ref={forwardRef}>
    <div className="form-group row">
      <label htmlFor="username" className="col-md-3 col-form-label text-md-right">Username</label>

      <div className="col-md-8">
        <input type="text" className="form-control" name="username" required autoComplete="username" />
        <span className="text-danger" role="alert">
          <Errors errors={errors.username} />
        </span>
      </div>
    </div>

    <div className="form-group row">
      <label htmlFor="loginPassword" className="col-md-3 col-form-label text-md-right">Password</label>

      <div className="col-md-8">
        <input type="password" className="form-control" name="password" required autoComplete="current-password" />
        <span className="text-danger" role="alert">
          <Errors errors={errors.password} />
        </span>
      </div>
    </div>

    <div className="form-group row">
      <div className="col-md-8 offset-md-3">
        <div className="form-check">
          <input className="form-check-input" type="checkbox" name="remember" />

          <label className="form-check-label" htmlFor="remember">
            Remember Me
          </label>
        </div>
      </div>
    </div>

    <div className="form-group row mb-0">
      <div className="col-md-8 offset-md-3">
        <button type="button" className="btn btn-primary" onClick={onLogin}>
          Login
        </button>
        <button type="button" className="btn" onClick={onHide}>Cancel</button>

        <span className="text-danger" role="alert">
          <Errors errors={errors.general} />
        </span>
      </div>
    </div>

    <div className="form-group row mb-0">
      <div className="col-md-8 offset-md-3">
        <div onClick={onForgotPasswordClick} className="text-link">
          I forgot my password.
        </div>
      </div>
    </div>
  </form>
);

LoginPanel.propTypes = {
  onHide: PropTypes.func.isRequired,
  onLogin: PropTypes.func.isRequired,
  onForgotPasswordClick: PropTypes.func.isRequired,
  errors: PropTypes.shape().isRequired,
};

export default React.forwardRef(LoginPanel);
