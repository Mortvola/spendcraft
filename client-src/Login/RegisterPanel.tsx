import React from 'react';
import { Errors } from '@mortvola/forms';
import { ErrorsType } from './submit';

type PropTypes = {
  onHide: (() => void);
  onRegister: (() => void);
  errors: ErrorsType;
}

const RegisterPanel = React.forwardRef<HTMLFormElement, PropTypes>(({
  onHide,
  onRegister,
  errors,
}: PropTypes, forwardRef) => (
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
      <label htmlFor="email" className="col-md-3 col-form-label text-md-right">E-Mail Address</label>

      <div className="col-md-8">
        <input type="email" className="form-control" name="email" defaultValue="" required autoComplete="email" />

        <span className="text-danger" role="alert">
          <Errors errors={errors.email} />
        </span>
      </div>
    </div>

    <div className="form-group row">
      <label htmlFor="registerPassword" className="col-md-3 col-form-label text-md-right">Password</label>

      <div className="col-md-8">
        <input type="password" className="form-control" name="password" required autoComplete="new-password" />

        <span className="text-danger" role="alert">
          <Errors errors={errors.password} />
        </span>
      </div>
    </div>

    <div className="form-group row">
      <label htmlFor="password-confirm" className="col-md-3 col-form-label text-md-right">Confirm Password</label>

      <div className="col-md-8">
        <input
          type="password"
          className="form-control"
          name="password_confirmation"
          required
          autoComplete="new-password"
        />

        <span className="text-danger" role="alert">
          <Errors errors={errors.password_confirmation} />
        </span>
      </div>
    </div>

    <div className="form-group row mb-0">
      <div className="col-md-8 offset-md-3">
        <button type="button" className="btn btn-primary" onClick={onRegister}>
          Register
        </button>
        <button type="button" className="btn" onClick={onHide}>Cancel</button>

        <span className="text-danger" role="alert">
          <Errors errors={errors.general} />
        </span>
      </div>
    </div>
  </form>
));

RegisterPanel.displayName = 'RegisterPanel';

export default RegisterPanel;
