import React from 'react';
import * as responsive from 'react-responsive';
import { useNavigate } from 'react-router-dom';
import styles from './Signin.module.css';
import EnterEmailAddress from './EnterEmailAddress';
import EnterPassCode from './EnterPassCode';
import ChangePassword from './ChangePassword';
import { Context } from './Types';

const RecoverPassword: React.FC = () => {
  const tiny = responsive.useMediaQuery({ query: '(max-width: 350px)' });
  const small = responsive.useMediaQuery({ query: '(max-width: 600px)' });
  const medium = responsive.useMediaQuery({ query: '(max-width: 1224px)' });
  const [context, setContext] = React.useState<Context>({ state: 'Enter Email', email: '' });
  const navigate = useNavigate();

  const addSizeClass = (className: string): string => {
    if (tiny && styles.tiny) {
      return `${styles.tiny} ${className}`;
    }

    if (small && styles.small) {
      return `${styles.small} ${className}`;
    }

    if (medium && styles.medium) {
      return `${styles.medium} ${className}`
    }

    return className
  }

  const handleNext = (newContext: Context) => {
    setContext((prev) => {
      switch (prev.state) {
        case 'Enter Email':
          return { ...newContext, state: 'Verify Code' };
        case 'Verify Code':
          return { ...newContext, state: 'Change Password' };
        case 'Change Password':
          navigate('/home');
          return prev;
        default:
          return prev;
      }
    })
  }

  const renderForm = (rememberedLink: React.ReactNode) => {
    switch (context.state) {
      case 'Enter Email':
        return <EnterEmailAddress context={context} onNext={handleNext} link={rememberedLink} />;
      case 'Verify Code':
        return <EnterPassCode context={context} onNext={handleNext} link={rememberedLink} />;
      case 'Change Password':
        return <ChangePassword context={context} onNext={handleNext} link={rememberedLink} />;
      default:
        return null;
    }
  }

  const handleTitleClick = () => {
    navigate('/');
  }

  return (
    <div className={addSizeClass(styles.frame)}>
      <div className={styles.title} onClick={handleTitleClick}>SpendCraft</div>
      {
        renderForm(<a href="/signin">I remember my password.</a>)
      }
    </div>
  );
}

export default RecoverPassword;
