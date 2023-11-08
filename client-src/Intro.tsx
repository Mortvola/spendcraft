import React from 'react';
import { useNavigate } from 'react-router-dom';
import * as responsive from 'react-responsive';
import 'regenerator-runtime';
import styles from './Intro.module.scss';

const Intro: React.FC = () => {
  const navigate = useNavigate();
  const tiny = responsive.useMediaQuery({ query: '(max-width: 350px)' });
  const small = responsive.useMediaQuery({ query: '(max-width: 600px)' });
  const medium = responsive.useMediaQuery({ query: '(max-width: 1224px)' });

  const handleSignupClick = () => {
    navigate('/signup');
  }

  const handleSigninClick = () => {
    navigate('/signin');
  }

  const addSizeClass = (className: string): string => {
    if (tiny) {
      return `${styles.tiny} ${className}`;
    }

    if (small) {
      return `${styles.small} ${className}`;
    }

    if (medium) {
      return `${styles.medium} ${className}`
    }

    return className
  }

  return (
    <div className={addSizeClass(`${styles.frame} position-ref full-height`)}>
      <div className={styles.buttonTray}>
        <div className={styles.linkButton} onClick={handleSignupClick}>
          Sign up
        </div>
        <div className={styles.linkButton} onClick={handleSigninClick}>
          Sign in
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.introText}>
          <div className={styles.title}>
            SpendCraft
          </div>
          <div className={styles.catchPhrase}>We all spend money.</div>
          <div className={styles.catchPhrase}>Be smart about how you spend it.</div>
          <div className={styles.subCatchPhrase}>
            With an easy to use envelope style budgeting system,
            take control of your expenditures and spend your money
            on the things that are important to you.
          </div>
          <div className={`${styles.linkButton} ${styles.signupFreeButton}`} onClick={handleSignupClick}>
            Sign up for free
          </div>
        </div>
        <img
          src="/budgeting.svg"
          alt=""
          className={styles.image}
        />
      </div>
    </div>
  );
};

export default Intro;
