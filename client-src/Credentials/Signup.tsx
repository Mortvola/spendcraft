import React from 'react';
import * as responsive from 'react-responsive';
import { useNavigate } from 'react-router-dom';
import styles from './Signup.module.scss';
import EnterUserInfo from './EnterUserInfo';
import { Context } from './Types';
import EnterPassCode from './EnterPassCode';

const Signup: React.FC = () => {
  const tiny = responsive.useMediaQuery({ query: '(max-width: 350px)' });
  const small = responsive.useMediaQuery({ query: '(max-width: 600px)' });
  const medium = responsive.useMediaQuery({ query: '(max-width: 1224px)' });
  const [context, setContext] = React.useState<Context>({ state: 'Enter Info', email: '' });
  const navigate = useNavigate();

  const addSizeClass = (className: string): string => {
    if (tiny) {
      // eslint-disable-next-line css-modules/no-undef-class
      return `${styles.tiny} ${className}`;
    }

    if (small) {
      // eslint-disable-next-line css-modules/no-undef-class
      return `${styles.small} ${className}`;
    }

    if (medium) {
      // eslint-disable-next-line css-modules/no-undef-class
      return `${styles.medium} ${className}`
    }

    return className
  }

  const handleNext = (newContext: Context) => {
    setContext((prev) => {
      switch (prev.state) {
        case 'Enter Info':
          return { ...newContext, state: 'Verify Code' };
        case 'Verify Code':
          navigate('/home');
          return prev;
        default:
          return prev;
      }
    });
  }

  const renderForm = () => {
    switch (context.state) {
      case 'Enter Info':
        return <EnterUserInfo context={context} onNext={handleNext} />
      case 'Verify Code':
        return <EnterPassCode context={context} onNext={handleNext} />
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
      { renderForm() }
    </div>
  );
}

export default Signup;
