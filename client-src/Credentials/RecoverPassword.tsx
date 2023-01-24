import React from 'react';
import * as responsive from 'react-responsive';
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

  const handleCompletion = (newContext: Context) => {
    setContext(newContext);
  }

  const renderForm = (rememberedLink: React.ReactNode) => {
    switch (context.state) {
      case 'Enter Email':
        return <EnterEmailAddress context={context} onCompletion={handleCompletion} link={rememberedLink} />;
      case 'Verify Code':
        return <EnterPassCode context={context} onCompletion={handleCompletion} link={rememberedLink} />;
      case 'Change Password':
        return <ChangePassword context={context} link={rememberedLink} />;
      default:
        return null;
    }
  }

  return (
    <div className={addSizeClass(styles.frame)}>
      <div className={styles.title}>SpendCraft</div>
      {
        renderForm(<a href="/signin">I remember my password.</a>)
      }
    </div>
  );
}

export default RecoverPassword;
